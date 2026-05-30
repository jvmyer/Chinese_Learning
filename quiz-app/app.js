// ── STATE ──────────────────────────────────────────────────────────────
const STORAGE_KEY = 'chinesisch_quiz_v1';

let sets          = [];
let currentSet    = null;
let sessionCards  = [];
let sessionIdx    = 0;
let sessionCorrect = 0;
let sessionWrong  = [];   // Karten die in dieser Session falsch waren
let sessionMode   = 'learn';
let sessionDir    = 'zh';
let sessionType   = 'all';
let cardFlipped   = false;
let mcAnswered    = false;
let progress      = {};
let newCardQueue      = [];
let batchCorrect      = 0;
let pendingTypingCards = new Map(); // cardId → verbleibende richtige Eingaben
const BATCH_SIZE      = 8;

// ── NORMALISIERUNG ─────────────────────────────────────────────────────
function getDE(card) { return card.german || card.english || ''; }
function cardId(card) { return card.chinese + '|' + getDE(card); }

// ── PERSISTENCE: localStorage ──────────────────────────────────────────
function loadProgress() {
  try { progress = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { progress = {}; }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function getCardProgress(setId, cId) {
  progress[setId] = progress[setId] || {};
  progress[setId][cId] = progress[setId][cId] || {
    ease: 2.5, interval: 0, due: 0, seen: 0, correct: 0, streak: 0
  };
  return progress[setId][cId];
}

// ── PERSISTENCE: progress/progress.json ───────────────────────────────
async function loadProgressFile() {
  try {
    const res = await fetch('../progress/progress.json');
    if (!res.ok) return;
    const fileData = await res.json();

    // Merze: pro Karte gewinnt der Eintrag mit mehr `seen` (aktuellere Daten)
    let merged = 0;
    for (const [setId, cards] of Object.entries(fileData)) {
      if (setId === '__meta__') continue;
      progress[setId] = progress[setId] || {};
      for (const [cId, fp] of Object.entries(cards)) {
        const lp = progress[setId][cId];
        if (!lp || fp.seen > lp.seen) {
          progress[setId][cId] = fp;
          merged++;
        }
      }
    }
    if (merged > 0) {
      saveProgress();
      renderHome();
    }
  } catch { /* kein Server oder keine Datei – kein Problem */ }
}

function saveProgressFile() {
  const data = {
    __meta__: { savedAt: new Date().toISOString(), total: Object.values(progress).reduce((n, s) => n + Object.keys(s).length, 0) },
    ...progress
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'progress.json';
  a.click();
  URL.revokeObjectURL(url);

  const hint = document.getElementById('save-hint');
  hint.style.display = '';
  setTimeout(() => hint.style.display = 'none', 6000);
}

// ── SM-2 ───────────────────────────────────────────────────────────────
function sm2Rate(p, rating) {
  p.seen++;
  if (rating >= 4) { p.correct++; p.streak = (p.streak || 0) + 1; }
  else if (rating < 3) p.streak = 0;
  if (rating < 3) {
    p.interval = 1;
  } else {
    if (p.interval === 0) p.interval = 1;
    else if (p.interval === 1) p.interval = 6;
    else p.interval = Math.round(p.interval * p.ease);
    p.ease = Math.max(1.3, p.ease + 0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02));
  }
  p.due = Date.now() + p.interval * 86400000;
  return p;
}

function isDue(p)  { return p.due <= Date.now() || p.seen === 0; }
function isNew(p)  { return p.seen === 0; }
function isWeak(p) { return p.seen > 0 && (p.correct / p.seen) < 0.6; }

// ── REQUIRED CORRECT ───────────────────────────────────────────────────
// 0 Fehler → 1×, 1–2 Fehler → 2×, ≥3 Fehler → 3×
// Decay: je 2 korrekte Antworten in Folge (streak) wird 1 Altfehler vergeben,
// damit gut gelernte Wörter nicht ewig 2–3× verlangt werden.
function requiredCorrect(p) {
  const rawErrors = (p.seen || 0) - (p.correct || 0);
  const forgiven  = Math.floor((p.streak || 0) / 2);
  const errors    = Math.max(0, rawErrors - forgiven);
  if (errors <= 0) return 1;
  if (errors <= 2) return 2;
  return 3;
}

// ── PHASEN ─────────────────────────────────────────────────────────────
// Schwellwerte: < 21 Tage = Lernen, < 60 Tage = Review, ≥ 60 Tage = Sicher
function getPhase(p) {
  if (p.seen === 0)     return { key: 'new',      label: 'Neu' };
  if (p.interval < 21)  return { key: 'learning', label: 'Lernen' };
  if (p.interval < 60)  return { key: 'review',   label: 'Review' };
  return                       { key: 'mastered', label: 'Sicher' };
}

function phaseCounts(setId, cards) {
  const c = { new: 0, learning: 0, review: 0, mastered: 0 };
  cards.forEach(card => c[getPhase(getCardProgress(setId, cardId(card))).key]++);
  return c;
}

function phaseBarHTML(pc, total) {
  const w = k => total > 0 ? (pc[k] / total * 100).toFixed(1) + '%' : '0%';
  return `<div class="phase-bar">
    <div class="ps ps-new"      style="width:${w('new')}"></div>
    <div class="ps ps-learning" style="width:${w('learning')}"></div>
    <div class="ps ps-review"   style="width:${w('review')}"></div>
    <div class="ps ps-mastered" style="width:${w('mastered')}"></div>
  </div>`;
}

function phaseChipsHTML(pc) {
  return `<span class="phase-chip pc-new">${pc.new} Neu</span>
    <span class="phase-chip pc-learning">${pc.learning} Lernen</span>
    <span class="phase-chip pc-review">${pc.review} Review</span>
    <span class="phase-chip pc-mastered">${pc.mastered} Sicher</span>`;
}

// ── AUTO-LOAD MASTER.JSON ──────────────────────────────────────────────
async function loadMasterVocab() {
  try {
    const res = await fetch('../vocab/master.json');
    if (!res.ok) return;
    const data = await res.json();
    if (!Array.isArray(data.vocab) || data.vocab.length === 0) return;

    const masterSet = {
      id:      '__master__',
      name:    `Alle Vokabeln (${data.total || data.vocab.length})`,
      created: data.updated || '',
      cards:   data.vocab.map(v => ({
        chinese: v.chinese,
        pinyin:  v.pinyin  || '',
        german:  v.german  || '',
        english: v.german  || '',
        example: v.example || '',
      }))
    };

    const idx = sets.findIndex(s => s.id === '__master__');
    if (idx >= 0) sets[idx] = masterSet;
    else sets.unshift(masterSet);

    renderHome();
  } catch { /* file://-Protokoll oder kein Server */ }
}

// ── IMPORT (file-picker) ───────────────────────────────────────────────
document.getElementById('file-import').addEventListener('change', async (e) => {
  for (const file of Array.from(e.target.files)) {
    try {
      const raw = JSON.parse(await file.text());
      let set;

      if (raw.vocab && Array.isArray(raw.vocab)) {
        set = {
          id: '__master__', name: `Alle Vokabeln (${raw.total || raw.vocab.length})`,
          created: raw.updated || '',
          cards: raw.vocab.map(v => ({ chinese: v.chinese, pinyin: v.pinyin || '', german: v.german || '', english: v.german || '', example: v.example || '' }))
        };
      } else if (raw.id && Array.isArray(raw.cards)) {
        set = raw;
      } else {
        throw new Error('Ungültiges Format');
      }

      const idx = sets.findIndex(s => s.id === set.id);
      if (idx >= 0) sets[idx] = set;
      else sets.push(set);

    } catch (err) { alert(`Fehler in ${file.name}: ${err.message}`); }
  }
  e.target.value = '';
  renderHome();
});

// ── HOME ───────────────────────────────────────────────────────────────
function renderHome() {
  const list = document.getElementById('sets-list');
  if (sets.length === 0) {
    list.innerHTML = '<p class="empty-hint">Lädt…<br>Falls nichts erscheint: App über lokalen Server starten:<br><code>python3 -m http.server 8765</code></p>';
    document.getElementById('global-stats').style.display = 'none';
    return;
  }

  list.innerHTML = '';
  let totalCards = 0, totalLearned = 0, totalDue = 0;
  const totalPh = { new: 0, learning: 0, review: 0, mastered: 0 };

  sets.forEach(set => {
    const total = set.cards.length;
    let learned = 0, due = 0;
    const ph = phaseCounts(set.id, set.cards);
    set.cards.forEach(c => {
      const p = getCardProgress(set.id, cardId(c));
      if (p.seen > 0) learned++;
      if (isDue(p)) due++;
    });
    totalCards += total; totalLearned += learned; totalDue += due;
    totalPh.new += ph.new; totalPh.learning += ph.learning;
    totalPh.review += ph.review; totalPh.mastered += ph.mastered;
    const pct = total > 0 ? Math.round((learned / total) * 100) : 0;

    const el = document.createElement('div');
    el.className = 'set-card';
    el.onclick = () => openSet(set);
    el.innerHTML = `
      <div class="set-card-info">
        <div class="set-card-name">${set.name}</div>
        <div class="set-card-meta">${total} Karten · ${due} fällig</div>
        ${phaseBarHTML(ph, total)}
      </div>
      <div class="set-card-progress">
        <span class="progress-ring">${pct}%</span>
      </div>`;
    list.appendChild(el);
  });

  document.getElementById('global-stats').style.display = '';
  document.getElementById('stat-total').textContent   = totalCards;
  document.getElementById('stat-learned').textContent = totalLearned;
  document.getElementById('stat-due').textContent     = totalDue;
  const statPhases = document.getElementById('stat-phases');
  if (statPhases) statPhases.innerHTML = phaseChipsHTML(totalPh);
}

function showHome() { showScreen('home'); renderHome(); }

// ── SET SCREEN ─────────────────────────────────────────────────────────
function openSet(set) {
  currentSet = set;
  document.getElementById('set-title').textContent      = set.name;
  document.getElementById('set-card-count').textContent = set.cards.length;

  const learned = set.cards.filter(c => getCardProgress(set.id, cardId(c)).seen > 0).length;
  const pct = set.cards.length > 0 ? Math.round((learned / set.cards.length) * 100) : 0;
  document.getElementById('set-progress-text').textContent = `${pct}% gelernt`;

  const ph = phaseCounts(set.id, set.cards);
  const breakdown = document.getElementById('set-phase-breakdown');
  if (breakdown) breakdown.innerHTML = phaseChipsHTML(ph);

  // Session-Zähler
  let cntAll = set.cards.length, cntDue = 0, cntNew = 0, cntWeak = 0;
  set.cards.forEach(c => {
    const p = getCardProgress(set.id, cardId(c));
    if (isDue(p))  cntDue++;
    if (isNew(p))  cntNew++;
    if (isWeak(p)) cntWeak++;
  });
  document.getElementById('cnt-all').textContent  = cntAll;
  document.getElementById('cnt-due').textContent  = cntDue;
  document.getElementById('cnt-new').textContent  = cntNew;
  document.getElementById('cnt-weak').textContent = cntWeak;

  renderPreview(set);
  showScreen('set');
}

function renderPreview(set) {
  const container = document.getElementById('set-cards-preview');
  container.innerHTML = '';
  set.cards.slice(0, 8).forEach(c => {
    const p = getCardProgress(set.id, cardId(c));
    const dotClass = isNew(p) ? '' : (isDue(p) ? 'due' : 'learned');
    const el = document.createElement('div');
    el.className = 'preview-row';
    el.innerHTML = `
      <span class="preview-zh">${c.chinese}</span>
      <span class="preview-py">${c.pinyin}</span>
      <span class="preview-de">${getDE(c)}</span>
      <span class="preview-dot ${dotClass}"></span>`;
    container.appendChild(el);
  });
  if (set.cards.length > 8) {
    const more = document.createElement('p');
    more.style.cssText = 'text-align:center;font-size:.82rem;color:var(--text-muted);padding:8px 0';
    more.textContent = `… und ${set.cards.length - 8} weitere`;
    container.appendChild(more);
  }
}

function selectMode(btn, mode) {
  document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  sessionMode = mode;
}

function selectDir(btn, dir) {
  document.querySelectorAll('.btn-dir').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  sessionDir = dir;
}

function resetSet() {
  if (!currentSet) return;
  if (!confirm(`Fortschritt für „${currentSet.name}" wirklich zurücksetzen?`)) return;
  progress[currentSet.id] = {};
  saveProgress();
  openSet(currentSet);
}

function resetAllProgress() {
  if (!confirm('Alle Vokabeln auf Neu zurücksetzen? Das kann nicht rückgängig gemacht werden.')) return;
  progress = {};
  saveProgress();
  if (currentSet) openSet(currentSet);
  else renderHome();
}

// ── SESSION ────────────────────────────────────────────────────────────
function startSession(type) {
  if (!currentSet) return;
  sessionType = type;
  let cards = currentSet.cards;

  if (type === 'due')   cards = cards.filter(c => isDue(getCardProgress(currentSet.id, cardId(c))));
  if (type === 'new')   cards = cards.filter(c => isNew(getCardProgress(currentSet.id, cardId(c))));
  if (type === 'weak')  cards = cards.filter(c => isWeak(getCardProgress(currentSet.id, cardId(c))));
  if (type === 'wrong') cards = [...sessionWrong];

  if (cards.length === 0) {
    const msgs = {
      due:   'Keine fälligen Karten – alles gelernt! 🎉',
      new:   'Keine neuen Karten mehr.',
      weak:  'Keine schwachen Karten – stark gemacht! 💪',
      wrong: 'Keine falschen Karten aus der letzten Session.',
    };
    alert(msgs[type] || 'Keine Karten gefunden.');
    return;
  }

  newCardQueue = [];
  batchCorrect = 0;
  pendingTypingCards.clear();
  if (sessionMode === 'learn') {
    const newCards   = cards.filter(c =>  isNew(getCardProgress(currentSet.id, cardId(c))));
    const otherCards = cards.filter(c => !isNew(getCardProgress(currentSet.id, cardId(c))));
    if (newCards.length > BATCH_SIZE) {
      const shuffledNew = shuffle([...newCards]);
      newCardQueue = shuffledNew.slice(BATCH_SIZE);
      cards = [...otherCards, ...shuffledNew.slice(0, BATCH_SIZE)];
    }
  }

  sessionCards   = shuffle([...cards]);
  sessionIdx     = 0;
  sessionCorrect = 0;
  sessionWrong   = [];

  showScreen('quiz');
  setupQuizMode();
  showCard();
}

function repeatWrong()    { startSession('wrong'); }
function restartSession() { startSession(sessionType === 'wrong' ? 'all' : sessionType); }
function quitQuiz()       { showScreen('set'); openSet(currentSet); }

function setupQuizMode() {
  // Hide all modes initially; showCard() reveals the right one per card
  ['mode-flash', 'mode-mc', 'mode-type'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
}

function showCard() {
  if (sessionMode === 'learn') {
    if (sessionCards.length === 0) { endSession(); return; }
    const total = sessionCorrect + sessionCards.length + newCardQueue.length;
    document.getElementById('quiz-counter').textContent       = `${sessionCorrect} / ${total}`;
    document.getElementById('quiz-progress-bar').style.width = `${total > 0 ? (sessionCorrect / total * 100) : 0}%`;
  } else {
    if (sessionIdx >= sessionCards.length) { endSession(); return; }
    const total = sessionCards.length;
    document.getElementById('quiz-counter').textContent       = `${sessionIdx + 1} / ${total}`;
    document.getElementById('quiz-progress-bar').style.width = `${(sessionIdx / total) * 100}%`;
  }

  const card = sessionCards[sessionIdx];
  let mode = sessionMode;
  if (sessionMode === 'learn') {
    if (pendingTypingCards.has(cardId(card))) {
      mode = 'type';
    } else {
      const p = getCardProgress(currentSet.id, cardId(card));
      mode = p.seen === 0 ? 'mc' : 'type';
    }
  }

  document.getElementById('mode-flash').style.display = mode === 'flash' ? '' : 'none';
  document.getElementById('mode-mc').style.display    = mode === 'mc'    ? '' : 'none';
  document.getElementById('mode-type').style.display  = mode === 'type'  ? '' : 'none';

  if (mode === 'flash')      showFlashCard();
  else if (mode === 'mc')    showMCCard();
  else                       showTypeCard();
}

// ── FLASHCARD ──────────────────────────────────────────────────────────
function showFlashCard() {
  const card = sessionCards[sessionIdx];
  cardFlipped = false;
  document.getElementById('flash-card').querySelector('.card').classList.remove('flipped');

  const { front, back } = cardContent(card);
  document.getElementById('flash-front').innerHTML = front;
  document.getElementById('flash-back').innerHTML  = back;
  document.getElementById('flip-hint').style.display    = '';
  document.getElementById('rating-btns').style.display  = 'none';
}

function flipCard() {
  cardFlipped = !cardFlipped;
  document.getElementById('flash-card').querySelector('.card').classList.toggle('flipped', cardFlipped);
  document.getElementById('flip-hint').style.display   = cardFlipped ? 'none' : '';
  document.getElementById('rating-btns').style.display = cardFlipped ? 'flex' : 'none';
}

function advanceLearnCard(card, isCorrect) {
  const cId = cardId(card);
  if (pendingTypingCards.has(cId)) {
    if (isCorrect) {
      const remaining = pendingTypingCards.get(cId) - 1;
      if (remaining <= 0) {
        pendingTypingCards.delete(cId);
        sm2Rate(getCardProgress(currentSet.id, cId), 5);
        saveProgress();
        sessionCorrect++;
        sessionCards.splice(sessionIdx, 1);
        batchCorrect++;
        if (batchCorrect >= 5 && newCardQueue.length > 0) {
          sessionCards.push(...shuffle(newCardQueue.splice(0, BATCH_SIZE)));
          batchCorrect = 0;
        }
      } else {
        pendingTypingCards.set(cId, remaining);
        const c = sessionCards.splice(sessionIdx, 1)[0];
        sessionCards.splice(Math.min(sessionIdx + 3, sessionCards.length), 0, c);
      }
    } else {
      if (!sessionWrong.find(c => cardId(c) === cId)) sessionWrong.push(card);
      const wrongCard = sessionCards.splice(sessionIdx, 1)[0];
      sessionCards.splice(Math.min(sessionIdx + 3, sessionCards.length), 0, wrongCard);
    }
  } else {
    if (isCorrect) {
      const p = getCardProgress(currentSet.id, cId);
      if (p.seen === 0) {
        // Neue Karte: MC war richtig, jetzt Tippen (required basiert auf 0 Fehlern = 1×)
        pendingTypingCards.set(cId, requiredCorrect(p));
        const c = sessionCards.splice(sessionIdx, 1)[0];
        sessionCards.splice(Math.min(sessionIdx + 3, sessionCards.length), 0, c);
      } else {
        const required = requiredCorrect(p);
        if (required <= 1) {
          sm2Rate(p, 5);
          saveProgress();
          sessionCorrect++;
          sessionCards.splice(sessionIdx, 1);
          batchCorrect++;
          if (batchCorrect >= 5 && newCardQueue.length > 0) {
            sessionCards.push(...shuffle(newCardQueue.splice(0, BATCH_SIZE)));
            batchCorrect = 0;
          }
        } else {
          pendingTypingCards.set(cId, required - 1);
          const c = sessionCards.splice(sessionIdx, 1)[0];
          sessionCards.splice(Math.min(sessionIdx + 3, sessionCards.length), 0, c);
        }
      }
    } else {
      sm2Rate(getCardProgress(currentSet.id, cId), 1);
      saveProgress();
      if (!sessionWrong.find(c => cardId(c) === cId)) sessionWrong.push(card);
      const wrongCard = sessionCards.splice(sessionIdx, 1)[0];
      sessionCards.splice(Math.min(sessionIdx + 3, sessionCards.length), 0, wrongCard);
    }
  }
}

function rateCard(rating) {
  const card = sessionCards[sessionIdx];
  if (sessionMode === 'learn') {
    advanceLearnCard(card, rating >= 3);
  } else {
    sm2Rate(getCardProgress(currentSet.id, cardId(card)), rating);
    saveProgress();
    if (rating >= 4) sessionCorrect++;
    else sessionWrong.push(card);
    sessionIdx++;
  }
  showCard();
}

// ── MULTIPLE CHOICE ────────────────────────────────────────────────────
function showMCCard() {
  const card = sessionCards[sessionIdx];
  mcAnswered = false;

  document.getElementById('mc-question').innerHTML = mcContent(card).questionHTML;

  const distractors = shuffle(currentSet.cards.filter(c => cardId(c) !== cardId(card))).slice(0, 3);
  const options     = shuffle([card, ...distractors]);
  const container   = document.getElementById('mc-options');
  container.innerHTML = '';
  options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className   = 'mc-option';
    btn.dataset.mcIndex = i + 1;
    btn.dataset.mcText  = mcAnswerText(opt);
    btn.innerHTML   = `<span class="mc-num">${i + 1}</span>${mcAnswerText(opt)}`;
    btn.onclick = () => selectMCOption(btn, opt, card);
    container.appendChild(btn);
  });
}

function selectMCOption(btn, chosen, correct) {
  if (mcAnswered) return;
  mcAnswered = true;
  const isCorrect = cardId(chosen) === cardId(correct);

  document.querySelectorAll('.mc-option').forEach(b => {
    b.disabled = true;
    if (mcAnswerText(correct) === b.dataset.mcText) b.classList.add('correct');
  });
  if (!isCorrect) btn.classList.add('wrong');

  if (sessionMode === 'learn') {
    advanceLearnCard(correct, isCorrect);
    setTimeout(() => showCard(), isCorrect ? 800 : 2500);
  } else {
    sm2Rate(getCardProgress(currentSet.id, cardId(correct)), isCorrect ? 5 : 1);
    saveProgress();
    if (isCorrect) sessionCorrect++;
    else sessionWrong.push(correct);
    setTimeout(() => { sessionIdx++; showCard(); }, isCorrect ? 2000 : 3000);
  }
}

// ── CARD CONTENT ───────────────────────────────────────────────────────
function cardContent(card) {
  const de  = getDE(card);
  const p   = getCardProgress(currentSet.id, cardId(card));
  const ph  = getPhase(p);
  const badge = `<span class="phase-badge pb-${ph.key}">${ph.label}</span>`;
  if (sessionDir === 'de') return {
    front: `${badge}<div class="card-label">Deutsch</div><div class="card-de" style="font-size:1.5rem">${de}</div>`,
    back:  `<div class="card-label">Pinyin</div><div class="card-py" style="font-size:1.8rem">${card.pinyin}</div>${card.example ? `<div class="card-ex">${card.example}</div>` : ''}`
  };
  return {
    front: `${badge}<div class="card-label">Chinesisch</div><div class="card-zh">${card.chinese}</div>`,
    back:  `<div class="card-label">Bedeutung</div><div class="card-py">${card.pinyin}</div><div class="card-de">${de}</div>${card.example ? `<div class="card-ex">${card.example}</div>` : ''}`
  };
}

function mcContent(card) {
  const de  = getDE(card);
  const p   = getCardProgress(currentSet.id, cardId(card));
  const ph  = getPhase(p);
  const badge = `<span class="phase-badge pb-${ph.key}">${ph.label}</span>`;
  if (sessionDir === 'de') return { questionHTML: `${badge}<div class="card-label">Wie heißt auf Chinesisch:</div><div class="card-de" style="font-size:1.4rem;font-weight:600">${de}</div>` };
  return { questionHTML: `${badge}<div class="card-label">Was bedeutet:</div><div class="card-zh" style="font-size:2.4rem">${card.chinese}</div><div class="card-py">${card.pinyin}</div>` };
}

function mcAnswerText(card) {
  if (sessionDir === 'de') return card.pinyin;
  return getDE(card);
}

// ── SPEECH ────────────────────────────────────────────────────────────
function speakChinese(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'zh-CN';
  utt.rate = 0.85;
  window.speechSynthesis.speak(utt);
}

function speakCurrentCard() {
  if (sessionCards[sessionIdx]) speakChinese(sessionCards[sessionIdx].chinese);
}

// ── TYPING MODE ───────────────────────────────────────────────────────
function showTypeCard() {
  const card = sessionCards[sessionIdx];
  const p  = getCardProgress(currentSet.id, cardId(card));
  const ph = getPhase(p);
  const badge = `<span class="phase-badge pb-${ph.key}">${ph.label}</span>`;
  let qHTML = '', placeholder = '';
  if (sessionDir === 'de') {
    qHTML = `${badge}<div class="card-label">Pinyin eingeben:</div><div class="card-de" style="font-size:1.5rem;font-weight:600">${getDE(card)}</div>`;
    placeholder = 'Pinyin (z.B. nǐ hǎo)…';
  } else {
    qHTML = `${badge}<div class="card-label">Was bedeutet auf Deutsch:</div><div class="card-zh" style="font-size:2.4rem">${card.chinese}</div><div class="card-py">${card.pinyin}</div>`;
    placeholder = 'Deutsche Bedeutung…';
  }
  document.getElementById('type-question').innerHTML = qHTML;
  const inp = document.getElementById('type-input');
  inp.value = ''; inp.placeholder = placeholder; inp.disabled = false;
  document.getElementById('type-result').style.display    = 'none';
  document.getElementById('type-next-btns').style.display = 'none';
  document.getElementById('type-submit').style.display    = '';
  setTimeout(() => inp.focus(), 50);
}

function normalizeStr(s) {
  return s.toLowerCase().trim().replace(/[.,?!。，？！]/g, '').replace(/\s+/g, ' ');
}

function stripTones(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function checkTypeAnswer(userInput, card) {
  const user = normalizeStr(userInput);
  if (sessionDir === 'de') {
    return stripTones(user) === stripTones(card.pinyin);
  }
  return getDE(card).split('/').map(a => normalizeStr(a)).some(a => a === user);
}

function submitType() {
  const inp = document.getElementById('type-input');
  if (inp.disabled) return;
  const card     = sessionCards[sessionIdx];
  const isOk     = checkTypeAnswer(inp.value, card);
  const correct  = sessionDir === 'de' ? card.pinyin : getDE(card);
  inp.disabled   = true;
  document.getElementById('type-submit').style.display = 'none';

  const res = document.getElementById('type-result');
  res.className  = `type-result ${isOk ? 'type-correct' : 'type-wrong'}`;
  res.innerHTML  = isOk ? '✅ Richtig!' : `❌ Richtig wäre: <strong>${correct}</strong>`;
  res.style.display = '';

  const wrongBtn = document.getElementById('type-btn-wrong');
  const rightBtn = document.getElementById('type-btn-right');
  if (isOk) {
    wrongBtn.style.display = 'none';
    rightBtn.onclick = () => rateCard(5);
    rightBtn.textContent = '✅ Weiter';
  } else {
    wrongBtn.style.display = '';
    wrongBtn.onclick = () => rateCard(1);
    rightBtn.onclick = () => rateCard(5);
    rightBtn.textContent = 'Trotzdem weiter';
  }
  document.getElementById('type-next-btns').style.display = 'flex';
}

// ── END SESSION ────────────────────────────────────────────────────────
function endSession() {
  const total  = sessionCards.length;
  const wrong  = sessionWrong.length;
  const pct    = total > 0 ? Math.round((sessionCorrect / total) * 100) : 0;

  document.getElementById('quiz-progress-bar').style.width = '100%';

  // Emoji + Titel je nach Ergebnis
  const emoji = pct === 100 ? '🏆' : pct >= 70 ? '🎉' : pct >= 40 ? '📚' : '💪';
  document.getElementById('end-emoji').textContent = emoji;
  document.getElementById('end-title').textContent =
    pct === 100 ? 'Perfekt!' : pct >= 70 ? 'Gut gemacht!' : 'Weiter üben!';

  document.getElementById('end-stats').innerHTML = `
    <strong>${sessionCorrect}</strong> von <strong>${total}</strong> richtig &nbsp;·&nbsp; <strong>${pct}%</strong><br>
    ${wrong > 0 ? `<span style="color:var(--bad)">${wrong} falsch</span>` : '<span style="color:var(--good)">Keine Fehler</span>'}`;

  // "Falsche wiederholen" nur in anderen Modi anzeigen (Lernen zykliert bereits)
  document.getElementById('btn-repeat-wrong').style.display = (sessionMode !== 'learn' && wrong > 0) ? '' : 'none';

  showScreen('end');
}

// ── UTILS ──────────────────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  window.scrollTo(0, 0);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── INIT ───────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const typeMode = document.getElementById('mode-type');
    if (typeMode && typeMode.style.display !== 'none') {
      const inp = document.getElementById('type-input');
      const nextBtns = document.getElementById('type-next-btns');
      if (!inp.disabled) submitType();
      else if (nextBtns.style.display !== 'none') {
        const wrongBtn = document.getElementById('type-btn-wrong');
        if (wrongBtn && wrongBtn.style.display !== 'none') wrongBtn.click();
        else document.getElementById('type-btn-right').click();
      }
    }
  }
  if (['1','2','3','4'].includes(e.key)) {
    const mcMode = document.getElementById('mode-mc');
    if (mcMode && mcMode.style.display !== 'none') {
      const btn = document.querySelector(`.mc-option[data-mc-index="${e.key}"]`);
      if (btn && !btn.disabled) btn.click();
    }
  }
});

loadProgress();
showHome();
loadMasterVocab();
loadProgressFile();
