// Globale state
let allWords = [];
let availableWords = [];
let currentWord = null;
let sourceLang = null;
let targetLang = null;
let sessionActive = false;
let detectedLanguages = [];
let score = 0;

// Timer
let timerId = null;
let timeLeft = 0;
const TIMER_SECONDS = 10;

// DOM
const sourceSelect = document.getElementById('sourceLang');
const targetSelect = document.getElementById('targetLang');
const filterSelect = document.getElementById('filterType');
const startStopBtn = document.getElementById('startStopBtn');
const translateBtn = document.getElementById('translateBtn');
const nextBtn = document.getElementById('nextBtn');
const quitBtn = document.getElementById('quitBtn');
const outputSource = document.getElementById('outputSource');
const outputTarget = document.getElementById('outputTarget');
const statusDiv = document.getElementById('status');
const scoreValue = document.getElementById('scoreValue');
const timerValue = document.getElementById('timerValue');
const csvInput = document.getElementById('csvInput');

// Init
initApp();
registerServiceWorker();

function initApp() {
    csvInput.addEventListener('change', onCsvFileSelected);

    loadCsvFromFile('Vertalingen.csv', true);

    sourceSelect.addEventListener('change', onLanguageChange);
    targetSelect.addEventListener('change', onLanguageChange);

    startStopBtn.addEventListener('click', onStartStop);
    translateBtn.addEventListener('click', onTranslate);
    nextBtn.addEventListener('click', onNext);
    quitBtn.addEventListener('click', () => window.close());
}

function onCsvFileSelected(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
        const text = e.target.result;
        resetData();
        parseCsv(text);
        initLanguageSelects();
        initFilterSelect();
        statusDiv.textContent = 'CSV uit upload geladen. Kies brontaal en eindtaal.';
    };
    reader.readAsText(file, 'UTF-8');
}

function resetData() {
    allWords = [];
    availableWords = [];
    currentWord = null;
    detectedLanguages = [];
    sourceSelect.innerHTML = '<option value="">-- kies --</option>';
    targetSelect.innerHTML = '<option value="">-- kies --</option>';
    filterSelect.innerHTML = '<option value="">Geen filter</option>';
    score = 0;
    updateScore();
    stopTimer();
    timerValue.textContent = '--';
    outputSource.value = '';
    outputTarget.value = '';
}

function loadCsvFromFile(path, silentOnError = false) {
    fetch(path)
        .then(resp => {
            if (!resp.ok) throw new Error('CSV niet gevonden');
            return resp.text();
        })
        .then(text => {
            parseCsv(text);
            initLanguageSelects();
            initFilterSelect();
            if (!silentOnError) {
                statusDiv.textContent = 'CSV geladen. Kies brontaal en eindtaal.';
            } else {
                statusDiv.textContent = 'Standaard CSV geladen. Je kunt ook een CSV uploaden.';
            }
        })
        .catch(err => {
            console.error(err);
            if (!silentOnError) {
                statusDiv.textContent = 'Fout bij laden van CSV.';
            } else {
                statusDiv.textContent = 'Geen standaard CSV gevonden. Upload een CSV.';
            }
        });
}

function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) return;

    const headers = lines[0].split(';').map(h => h.trim());

    detectedLanguages = headers.filter(h =>
        h !== 'Functie' && h !== 'Comment' && h !== ''
    );

    for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(';');
        const wordObj = {};
        headers.forEach((h, idx) => {
            wordObj[h] = (cells[idx] || '').trim();
        });
        allWords.push(wordObj);
    }
}

function initLanguageSelects() {
    sourceSelect.innerHTML = '<option value="">-- kies --</option>';
    targetSelect.innerHTML = '<option value="">-- kies --</option>';

    detectedLanguages.forEach(lang => {
        const opt1 = document.createElement('option');
        opt1.value = lang;
        opt1.textContent = lang;
        sourceSelect.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = lang;
        opt2.textContent = lang;
        targetSelect.appendChild(opt2);
    });
}

function initFilterSelect() {
    filterSelect.innerHTML = '<option value="">Geen filter</option>';
    const uniqueTypes = [...new Set(allWords.map(w => w['Functie']).filter(x => x))];

    uniqueTypes.forEach(type => {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = type;
        filterSelect.appendChild(opt);
    });
}

function onLanguageChange() {
    sourceLang = sourceSelect.value || null;
    targetLang = targetSelect.value || null;

    if (sourceLang && targetLang && sourceLang === targetLang) {
        statusDiv.textContent = 'Brontaal en eindtaal moeten verschillend zijn.';
        startStopBtn.disabled = true;
        return;
    }

    startStopBtn.disabled = !(sourceLang && targetLang);
}

function onStartStop() {
    if (!sessionActive) {
        sessionActive = true;
        startStopBtn.textContent = 'Stop';
        sourceSelect.disabled = true;
        targetSelect.disabled = true;
        filterSelect.disabled = true;

        score = 0;
        updateScore();

        prepareAvailableWords();
        pickRandomWord();

        translateBtn.disabled = false;
        nextBtn.disabled = false;
        statusDiv.textContent = 'Sessie gestart.';
    } else {
        sessionActive = false;
        startStopBtn.textContent = 'Start';
        sourceSelect.disabled = false;
        targetSelect.disabled = false;
        filterSelect.disabled = false;

        outputSource.value = '';
        outputTarget.value = '';
        translateBtn.disabled = true;
        nextBtn.disabled = true;
        stopTimer();
        timerValue.textContent = '--';
        statusDiv.textContent = 'Sessie gestopt.';
    }
}

function prepareAvailableWords() {
    const filter = filterSelect.value;

    availableWords = allWords.filter(w =>
        w[sourceLang] && w[sourceLang].length > 0 &&
        w[targetLang] && w[targetLang].length > 0 &&
        (filter === '' || w['Functie'] === filter)
    );
}

function pickRandomWord() {
    if (availableWords.length === 0) {
        prepareAvailableWords();
        statusDiv.textContent = 'Alle woorden gebruikt, lijst opnieuw gestart.';
    }

    if (availableWords.length === 0) {
        outputSource.value = '';
        outputTarget.value = '';
        stopTimer();
        timerValue.textContent = '--';
        statusDiv.textContent = 'Geen woorden beschikbaar.';
        return;
    }

    const idx = Math.floor(Math.random() * availableWords.length);
    currentWord = availableWords[idx];
    availableWords.splice(idx, 1);

    outputSource.value = currentWord[sourceLang];
    outputTarget.value = '';

    startTimer();
}

function onTranslate() {
    if (!currentWord || !sessionActive) return;

    const translated = currentWord[targetLang];
    outputTarget.value = translated;

    score++;
    updateScore();

    stopTimer();
}

function onNext() {
    if (!sessionActive) return;
    pickRandomWord();
}

function updateScore() {
    scoreValue.textContent = score;
}

function startTimer() {
    stopTimer();
    timeLeft = TIMER_SECONDS;
    timerValue.textContent = timeLeft + 's';

    timerId = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            timerValue.textContent = '0s';
            stopTimer();
            pickRandomWord();
        } else {
            timerValue.textContent = timeLeft + 's';
        }
    }, 1000);
}

function stopTimer() {
    if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
    }
}

// --- PWA service worker registratie ---
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => {
                console.log('Service worker geregistreerd:', reg.scope);
            })
            .catch(err => {
                console.error('Service worker fout:', err);
            });
    }
}