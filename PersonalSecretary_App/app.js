// Register PWA Service Worker & Handle Auto Update
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('Service Worker registered successfully:', reg.scope);
        // Listen for new service worker installs to reload and apply updates immediately
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('New app version detected. Auto-reloading...');
              window.location.reload();
            }
          });
        });
      })
      .catch(err => console.log('Service Worker registration failed:', err));
  });
}

// State Management
let transactions = [];
let chartInstance = null;
let geminiApiKey = '';

// IndexedDB setup for storing binary Slip Images locally
const DB_NAME = 'SecretaryFinanceDB';
const DB_VERSION = 1;
const STORE_NAME = 'slips';
let db = null;

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = (e) => reject(e.target.error);
    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
    request.onupgradeneeded = (e) => {
      const dbInstance = e.target.result;
      if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
        dbInstance.createObjectStore(STORE_NAME);
      }
    };
  });
}

function saveSlipImage(txId, fileBlob) {
  if (!db) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(fileBlob, txId);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

function getSlipImage(txId) {
  if (!db) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(txId);
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

function deleteSlipImage(txId) {
  if (!db) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(txId);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}


// DOM Elements
const panels = document.querySelectorAll('.tab-panel');
const navItems = document.querySelectorAll('.bottom-nav .nav-item');
const modalAdd = document.getElementById('modal-add-transaction');
const btnAddManual = document.getElementById('btn-add-manual');
const btnCloseModal = document.getElementById('btn-close-modal');
const formManual = document.getElementById('form-manual-transaction');

// File upload / Scan elements
const btnSelectSlips = document.getElementById('btn-select-slips');
const slipFileInput = document.getElementById('slip-file-input');
const uploadDropzone = document.getElementById('upload-dropzone');
const scanningQueueCard = document.getElementById('scanning-queue-card');
const queueProgressText = document.getElementById('queue-progress-text');
const queueProgressBar = document.getElementById('queue-progress-bar');
const queueItemsContainer = document.getElementById('queue-items-container');
const scannedResultsSection = document.getElementById('scanned-results-section');
const scannedResultsContainer = document.getElementById('scanned-results-container');
const confirmCountSpan = document.getElementById('confirm-count');
const btnConfirmAll = document.getElementById('btn-confirm-all');

// Dashboard elements
const dbTotalBalance = document.getElementById('db-total-balance');
const dbTotalIncome = document.getElementById('db-total-income');
const dbTotalExpense = document.getElementById('db-total-expense');
const expenseChartCanvas = document.getElementById('expenseChart');
const chartPlaceholder = document.getElementById('chart-placeholder');

// History elements
const filterType = document.getElementById('filter-type');
const filterCategory = document.getElementById('filter-category');
const historyListContainer = document.getElementById('history-list-container');

// Advisor elements
const advSavings = document.getElementById('adv-savings');
const advSavingsRate = document.getElementById('adv-savings-rate');
const advSavingsBar = document.getElementById('adv-savings-bar');
const advSavingsFeedback = document.getElementById('adv-savings-feedback');
const advMindsetText = document.getElementById('adv-mindset-text');

// Wealth Simulator Elements
const wealthTargetInput = document.getElementById('wealth-target-input');
const wealthInterestInput = document.getElementById('wealth-interest-input');
const btnRunWealthSimulation = document.getElementById('btn-run-wealth-simulation');
const wealthSimResults = document.getElementById('wealth-sim-results');
const wealthSimText = document.getElementById('wealth-sim-text');

// Slip Viewer & Editor Elements
let currentEditingTxId = null;
const modalViewSlip = document.getElementById('modal-view-slip');
const btnCloseSlipModal = document.getElementById('btn-close-slip-modal');
const btnCancelSlipModal = document.getElementById('btn-cancel-slip-modal');
const btnSaveSlipCategory = document.getElementById('btn-save-slip-category');
const slipDetailTitle = document.getElementById('slip-detail-title');
const slipDetailAmount = document.getElementById('slip-detail-amount');
const slipDetailDate = document.getElementById('slip-detail-date');
const slipDetailCategorySelect = document.getElementById('slip-detail-category-select');
const slipDetailImg = document.getElementById('slip-detail-img');
const slipDetailImgPlaceholder = document.getElementById('slip-detail-img-placeholder');

// Category list
const categories = [
  "🍔 ของกิน",
  "💸 โอนให้คนอื่น",
  "🏠 รายจ่ายประจำเดือน",
  "⚠️ รายจ่ายไม่คาดคิด",
  "🛒 รายจ่ายทั่วไป/อื่นๆ"
];

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  // Load Lucide Icons
  lucide.createIcons();

  // Initialize Local database for slips
  try {
    await initDB();
    console.log('IndexedDB initialized successfully.');
  } catch (err) {
    console.error('IndexedDB failed to initialize:', err);
  }

  // Set today as default date in form
  document.getElementById('tx-date').valueAsDate = new Date();

  // Load data from LocalStorage
  loadData();

  // Setup Event Listeners
  setupEventListeners();

  // Populate month filter choices
  populateMonthFilter();

  // Render initial dashboard & history
  updateDashboard();
  renderHistory();
});

// Setup All Event Listeners
function setupEventListeners() {
  // Manual Transaction Modal
  btnAddManual.addEventListener('click', () => {
    document.getElementById('tx-date').valueAsDate = new Date();
    formManual.reset();
    document.getElementById('tx-date').valueAsDate = new Date();
    modalAdd.classList.add('active');
  });

  btnCloseModal.addEventListener('click', () => {
    modalAdd.classList.remove('active');
  });

  modalAdd.addEventListener('click', (e) => {
    if (e.target === modalAdd) {
      modalAdd.classList.remove('active');
    }
  });

  // Modal form input type changes dynamic field labels
  const typeRadios = formManual.querySelectorAll('input[name="tx-type"]');
  typeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const type = e.target.value;
      const titleLabel = document.getElementById('lbl-tx-title');
      const titleInput = document.getElementById('tx-title');
      const categoryGroup = document.getElementById('form-group-category');

      if (type === 'income') {
        titleLabel.textContent = 'แหล่งที่มารายรับ / ผู้โอน';
        titleInput.placeholder = 'เช่น เงินเดือน, ขายของได้, พ่อโอนให้';
        categoryGroup.style.display = 'none';
      } else if (type === 'expense') {
        titleLabel.textContent = 'รายการจ่าย / โอนให้ใคร';
        titleInput.placeholder = 'เช่น ค่าชาบู, โอนให้กิ๊ฟ, ค่าซ่อมแอร์';
        categoryGroup.style.display = 'flex';
      } else { // debt
        titleLabel.textContent = 'ชื่อหนี้สิน / เจ้าหนี้';
        titleInput.placeholder = 'เช่น กู้กสิกร, ยืมเพื่อน, ค่าบัตรเครดิต';
        categoryGroup.style.display = 'none';
      }
    });
  });

  // Save manual transaction
  formManual.addEventListener('submit', (e) => {
    e.preventDefault();
    const type = formManual.querySelector('input[name="tx-type"]:checked').value;
    const amount = parseFloat(document.getElementById('tx-amount').value);
    const title = document.getElementById('tx-title').value.trim();
    const date = document.getElementById('tx-date').value;
    let category = '';

    if (type === 'income') {
      category = '💰 รายรับ';
    } else if (type === 'debt') {
      category = '🏦 หนี้สิน';
    } else {
      category = document.getElementById('tx-category').value;
    }

    const newTx = {
      id: 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type,
      amount,
      title,
      category,
      date
    };

    addTransaction(newTx);
    modalAdd.classList.remove('active');
    formManual.reset();
    document.getElementById('tx-date').valueAsDate = new Date();
  });

  // File Upload Elements
  btnSelectSlips.addEventListener('click', () => {
    slipFileInput.click();
  });

  slipFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  });

  // Drag and Drop
  uploadDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadDropzone.classList.add('dragover');
  });

  uploadDropzone.addEventListener('dragleave', () => {
    uploadDropzone.classList.remove('dragover');
  });

  uploadDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadDropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  });

  // Filter History
  filterType.addEventListener('change', renderHistory);
  filterCategory.addEventListener('change', renderHistory);

  // Wealth Simulator Event Listener
  if (btnRunWealthSimulation) {
    btnRunWealthSimulation.addEventListener('click', runWealthSimulation);
  }

  // Month filter change triggers dashboard update
  const dbMonthFilter = document.getElementById('db-month-filter');
  if (dbMonthFilter) {
    dbMonthFilter.addEventListener('change', () => {
      updateDashboard();
    });
  }

  // Reset database button
  const btnResetDb = document.getElementById('btn-reset-db');
  if (btnResetDb) {
    btnResetDb.addEventListener('click', () => {
      if (confirm('⚠️ คุณต้องการล้างข้อมูลจำลองทั้งหมดเพื่อเริ่มบันทึกใช้งานจริงใช่หรือไม่? (ข้อมูลจำลองทั้งหมดจะถูกลบออก)')) {
        transactions = [];
        saveTransactions();
        populateMonthFilter();
        updateDashboard();
        renderHistory();
        updateAdvisor();
        alert('ล้างข้อมูลสำเร็จแล้ว! คุณสามารถเริ่มต้นบันทึกข้อมูลการเงินจริงของคุณได้ทันที');
      }
    });
  }

  // Backup & Restore listeners
  const btnExport = document.getElementById('btn-export-data');
  if (btnExport) {
    btnExport.addEventListener('click', exportData);
  }

  const btnImportTrigger = document.getElementById('btn-import-trigger');
  const importFileInput = document.getElementById('import-file-input');
  if (btnImportTrigger && importFileInput) {
    btnImportTrigger.addEventListener('click', () => {
      importFileInput.click();
    });
    importFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        importData(e.target.files[0]);
      }
    });
  }

  // Slip Viewer Modal Listeners
  if (btnCloseSlipModal) {
    btnCloseSlipModal.addEventListener('click', closeSlipModal);
  }
  if (btnCancelSlipModal) {
    btnCancelSlipModal.addEventListener('click', closeSlipModal);
  }
  if (btnSaveSlipCategory) {
    btnSaveSlipCategory.addEventListener('click', saveSlipCategory);
  }
  if (modalViewSlip) {
    modalViewSlip.addEventListener('click', (e) => {
      if (e.target === modalViewSlip) {
        closeSlipModal();
      }
    });
  }
}

// Switch Tabs
function switchTab(tabId) {
  // Update nav buttons
  navItems.forEach(item => {
    if (item.getAttribute('onclick').includes(tabId)) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update panels
  panels.forEach(panel => {
    if (panel.id === `panel-${tabId}`) {
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
    }
  });

  // Perform tab-specific refreshes
  if (tabId === 'dashboard') {
    updateDashboard();
  } else if (tabId === 'history') {
    renderHistory();
  } else if (tabId === 'advisor') {
    updateAdvisor();
  }

  // Refresh lucide icons for newly displayed tabs
  lucide.createIcons();
}

// Load Data from LocalStorage
function loadData() {
  const storedTx = localStorage.getItem('secretary_transactions');
  if (storedTx) {
    transactions = JSON.parse(storedTx);
  } else {
    // Put some premium mockup transactions if empty, so it doesn't look boring initially
    transactions = [
      { id: 'tx_mock_1', type: 'income', amount: 45000, title: 'เงินเดือนสะสม', category: '💰 รายรับ', date: getRecentDateString(5) },
      { id: 'tx_mock_2', type: 'expense', amount: 350, title: 'โอนชำระ ชาบูบุฟเฟต์', category: '🍔 ของกิน', date: getRecentDateString(4) },
      { id: 'tx_mock_3', type: 'expense', amount: 4500, title: 'โอนชำระ คอนโดประจำเดือน', category: '🏠 รายจ่ายประจำเดือน', date: getRecentDateString(3) },
      { id: 'tx_mock_4', type: 'expense', amount: 1500, title: 'อู่ช่างชาติ ซ่อมยางรถ', category: '⚠️ รายจ่ายไม่คาดคิด', date: getRecentDateString(2) },
      { id: 'tx_mock_5', type: 'expense', amount: 890, title: 'โอนจ่าย ค่าของใช้โลตัส', category: '🛒 รายจ่ายทั่วไป/อื่นๆ', date: getRecentDateString(1) }
    ];
    saveTransactions();
  }

}

// Get standard date relative to today for mockups
function getRecentDateString(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

// Save transactions
function saveTransactions() {
  localStorage.setItem('secretary_transactions', JSON.stringify(transactions));
}

// Add Single Transaction
function addTransaction(tx) {
  transactions.unshift(tx);
  saveTransactions();
  populateMonthFilter();
  updateDashboard();
  renderHistory();
}

// Delete Single Transaction
function deleteTransaction(id) {
  if (confirm('คุณต้องการลบรายการนี้ใช่หรือไม่?')) {
    transactions = transactions.filter(t => t.id !== id);
    saveTransactions();
    populateMonthFilter();
    updateDashboard();
    renderHistory();
    updateAdvisor();
  }
}

// Update Dashboard View
function updateDashboard() {
  let totalIncome = 0;
  let totalExpense = 0;
  let totalDebt = 0;

  // Group expense by category
  const expenseSummary = {
    "🍔 ของกิน": 0,
    "💸 โอนให้คนอื่น": 0,
    "🏠 รายจ่ายประจำเดือน": 0,
    "⚠️ รายจ่ายไม่คาดคิด": 0,
    "🛒 รายจ่ายทั่วไป/อื่นๆ": 0
  };

  // Get selected month filter value
  const monthFilter = document.getElementById('db-month-filter');
  const selectedMonth = monthFilter ? monthFilter.value : 'all';

  // Filter transactions based on selected month
  const filteredTxs = transactions.filter(tx => {
    if (selectedMonth === 'all') return true;
    return tx.date.startsWith(selectedMonth);
  });

  filteredTxs.forEach(tx => {
    if (tx.type === 'income') {
      totalIncome += tx.amount;
    } else if (tx.type === 'expense') {
      totalExpense += tx.amount;
      if (expenseSummary[tx.category] !== undefined) {
        expenseSummary[tx.category] += tx.amount;
      } else {
        expenseSummary["🛒 รายจ่ายทั่วไป/อื่นๆ"] += tx.amount;
      }
    } else if (tx.type === 'debt') {
      totalDebt += tx.amount;
    }
  });

  const totalBalance = totalIncome - totalExpense;

  // Update text values
  dbTotalBalance.textContent = formatCurrency(totalBalance);
  dbTotalIncome.textContent = formatCurrency(totalIncome);
  dbTotalExpense.textContent = formatCurrency(totalExpense);

  if (totalBalance < 0) {
    dbTotalBalance.style.color = 'var(--expense)';
  } else {
    dbTotalBalance.style.color = 'var(--text-primary)';
  }

  // Draw chart
  const hasExpenses = totalExpense > 0;
  if (hasExpenses) {
    chartPlaceholder.style.display = 'none';
    expenseChartCanvas.parentElement.style.display = 'block';

    const labels = Object.keys(expenseSummary);
    const data = Object.values(expenseSummary);
    const backgroundColors = [
      '#f59e0b', // food
      '#3b82f6', // transfer
      '#a855f7', // fixed
      '#f97316', // unexpected
      '#64748b'  // general
    ];

    if (chartInstance) {
      chartInstance.destroy();
    }

    chartInstance = new Chart(expenseChartCanvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: backgroundColors,
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.1)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#94a3b8',
              font: {
                family: 'Sarabun, sans-serif',
                size: 10
              },
              boxWidth: 12
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const value = context.raw;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percent = ((value / total) * 100).toFixed(1);
                return `${context.label}: ฿${value.toLocaleString()} (${percent}%)`;
              }
            }
          }
        },
        cutout: '70%'
      }
    });
  } else {
    chartPlaceholder.style.display = 'flex';
    expenseChartCanvas.parentElement.style.display = 'none';
  }
}

// Render History Panel
function renderHistory() {
  const selectedType = filterType.value;
  const selectedCat = filterCategory.value;

  historyListContainer.innerHTML = '';

  const filtered = transactions.filter(tx => {
    const matchType = (selectedType === 'all') || (tx.type === selectedType);
    const matchCat = (selectedCat === 'all') || (tx.category === selectedCat);
    return matchType && matchCat;
  });

  if (filtered.length === 0) {
    historyListContainer.innerHTML = `
      <div class="chart-placeholder">
        ไม่พบรายการที่ตรงกับเงื่อนไข
      </div>
    `;
    return;
  }

  filtered.forEach(tx => {
    const card = document.createElement('div');
    card.className = 'transaction-card';
    
    // Choose icon and emoji based on category
    let iconName = 'arrow-up-right';
    let emoji = '💸';

    if (tx.type === 'income') {
      iconName = 'arrow-down-left';
      emoji = '💰';
    } else if (tx.type === 'debt') {
      iconName = 'landmark';
      emoji = '🏦';
    } else {
      if (tx.category.includes('ของกิน')) emoji = '🍔';
      else if (tx.category.includes('โอนให้คนอื่น')) emoji = '💸';
      else if (tx.category.includes('ประจำเดือน')) emoji = '🏠';
      else if (tx.category.includes('ไม่คาดคิด')) emoji = '⚠️';
      else emoji = '🛒';
    }

    const typeClass = tx.type === 'income' ? 'income-type' : (tx.type === 'debt' ? 'debt-type' : 'expense-type');
    const prefix = tx.type === 'income' ? '+' : (tx.type === 'debt' ? '🏦' : '-');

    card.innerHTML = `
      <div class="tx-left">
        <div class="tx-icon-wrapper" data-category="${tx.category}">
          ${emoji}
        </div>
        <div class="tx-details">
          <span class="tx-title" style="cursor: pointer;" onclick="openSlipModal('${tx.id}')">${tx.title}</span>
          <div class="tx-sub-info">
            <span>${formatDateThai(tx.date)}</span>
            <span class="tag-category" data-category="${tx.category}" style="cursor: pointer;" onclick="openSlipModal('${tx.id}')">${tx.category}</span>
          </div>
        </div>
      </div>
      <div class="tx-right" style="display: flex; align-items: center; gap: 8px;">
        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end;">
          <span class="tx-amount ${typeClass}">${prefix} ฿${tx.amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
          ${tx.hasSlip ? `
          <button onclick="openSlipModal('${tx.id}')" style="margin-top: 4px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); color: var(--income); border-radius: 4px; padding: 2px 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; font-size: 9px;">
            <i data-lucide="receipt" style="width: 10px; height: 10px;"></i> ดูสลิป
          </button>
          ` : `
          <button onclick="openSlipModal('${tx.id}')" style="margin-top: 4px; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-color); color: var(--text-secondary); border-radius: 4px; padding: 2px 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; font-size: 9px;">
            <i data-lucide="edit-3" style="width: 10px; height: 10px;"></i> แก้หมวด
          </button>
          `}
        </div>
        <button class="btn-delete-tx" onclick="deleteTransaction('${tx.id}')" style="align-self: center;">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `;
    historyListContainer.appendChild(card);
  });

  lucide.createIcons();
}

// Update Advisor View
function updateAdvisor() {
  let totalIncome = 0;
  let totalExpense = 0;
  
  const categorySums = {
    "🍔 ของกิน": 0,
    "💸 โอนให้คนอื่น": 0,
    "🏠 รายจ่ายประจำเดือน": 0,
    "⚠️ รายจ่ายไม่คาดคิด": 0,
    "🛒 รายจ่ายทั่วไป/อื่นๆ": 0
  };

  // Get selected month filter value from dashboard selector
  const monthFilter = document.getElementById('db-month-filter');
  const selectedMonth = monthFilter ? monthFilter.value : 'all';

  // Filter transactions based on selected month
  const filteredTxs = transactions.filter(tx => {
    if (selectedMonth === 'all') return true;
    return tx.date.startsWith(selectedMonth);
  });

  filteredTxs.forEach(tx => {
    if (tx.type === 'income') {
      totalIncome += tx.amount;
    } else if (tx.type === 'expense') {
      totalExpense += tx.amount;
      if (categorySums[tx.category] !== undefined) {
        categorySums[tx.category] += tx.amount;
      } else {
        categorySums["🛒 รายจ่ายทั่วไป/อื่นๆ"] += tx.amount;
      }
    }
  });

  const netSavings = totalIncome - totalExpense;
  advSavings.textContent = formatCurrency(netSavings);

  if (netSavings < 0) {
    advSavings.className = 'col-value negative';
  } else {
    advSavings.className = 'col-value positive';
  }

  // Savings rate
  let savingsRateVal = 0;
  if (totalIncome > 0) {
    savingsRateVal = Math.round((netSavings / totalIncome) * 100);
  }
  advSavingsRate.textContent = `${savingsRateVal}%`;
  
  // Progress bar
  let displayPercent = Math.max(0, Math.min(100, savingsRateVal));
  advSavingsBar.style.width = `${displayPercent}%`;

  // Feedback and local rule-based advice
  let feedback = '';
  let advice = '';

  if (totalIncome === 0 && totalExpense === 0) {
    feedback = 'กรุณาบันทึกข้อมูลเพื่อคำนวณสัดส่วนการเงิน';
    advice = 'การเดินทางหมื่นลี้เริ่มต้นที่ก้าวแรก! กรุณาเริ่มบันทึกยอดรายรับในปุ่ม "+" และอัปโหลดสลิปรายจ่ายในหน้า "สแกนสลิป" เพื่อให้เลขาส่วนตัวการเงินของคุณได้วิเคราะห์แนวทางการบริหารการเงินฉบับมหาเศรษฐีให้คุณทันทีครับ';
  } else {
    // Generate feedback text
    if (savingsRateVal < 0) {
      feedback = '🚨 สภาพคล่องวิกฤต: คุณใช้เงินเกินกว่ารายได้ประจำเดือน';
    } else if (savingsRateVal < 10) {
      feedback = '⚠️ ระดับอันตราย: อัตราการออมต่ำมาก แทบไม่มีเก็บ';
    } else if (savingsRateVal < 30) {
      feedback = '👍 ระดับมาตรฐาน: มีเงินออมปานกลาง แต่ยังพัฒนาได้อีก';
    } else {
      feedback = '👑 ระดับยอดเยี่ยม: คุณควบคุมรายจ่ายได้ดีเยี่ยมและออมเงินได้สูง';
    }

    // Build rich mindset advice
    advice = `วิเคราะห์พฤติกรรมการเงินรายเดือน:\n\n`;

    if (savingsRateVal < 0) {
      advice += `💬 "คนรวยไม่ได้โฟกัสที่การใช้จ่ายแบบคนรวย แต่พวกเขาเรียนรู้ที่จะซื้อทรัพย์สินไม่ใช่หนี้สิน" การใช้จ่ายเงินเกินตัวนี้เป็นจุดเริ่มต้นของวงจรอุบาทว์ทางการเงิน คุณต้องตัดทอนรายจ่ายที่ไม่จำเป็นในหมวดหมู่อื่นออกทันที!\n\n`;
    } else if (savingsRateVal >= 30) {
      advice += `💬 "จ่ายเงินให้ตัวเองก่อนเสมอ (Pay Yourself First)" ยอดเยี่ยมมากครับ! คุณมีอัตรารักษาสภาพคล่องที่มั่นคง เงินเก็บสะสมระดับ ${savingsRateVal}% นี้ ควรถอนแยกออกไปฝากในบัญชีเพื่อการลงทุนทันที เพื่อไม่ให้เผลอเอามาใช้ในภายหลัง\n\n`;
    } else {
      advice += `💬 "ความมั่งคั่งไม่ได้ขึ้นอยู่กับว่าคุณหาเงินได้เท่าไหร่ แต่อยู่ที่ว่าคุณเก็บเงินได้เท่าไหร่ต่างหาก" อัตราการออม ${savingsRateVal}% ของคุณในขณะนี้ ถือว่าเพียงพอในการดำรงชีพ แต่ยังไม่สามารถส่งให้คุณเกษียณเร็วได้ ลองท้าทายตนเองให้เขยิบไปที่ 30% ดูครับ\n\n`;
    }

    // Check individual leaks
    const foodPercent = totalIncome > 0 ? (categorySums["🍔 ของกิน"] / totalIncome) * 100 : 0;
    const transferPercent = totalIncome > 0 ? (categorySums["💸 โอนให้คนอื่น"] / totalIncome) * 100 : 0;
    const fixedPercent = totalIncome > 0 ? (categorySums["🏠 รายจ่ายประจำเดือน"] / totalIncome) * 100 : 0;
    const unexpectedPercent = totalIncome > 0 ? (categorySums["⚠️ รายจ่ายไม่คาดคิด"] / totalIncome) * 100 : 0;

    if (foodPercent > 35) {
      advice += `🍔 **เจาะรูรั่วค่าอาหาร (${foodPercent.toFixed(0)}% ของรายรับ):** คุณเสียเงินไปกับค่าอาหารค่อนข้างสูงมาก คนรวยมักเห็นคุณค่าของการมีสุขภาพดีและทานอาหารที่ดี แต่พวกเขาจะไม่ปล่อยให้ไลฟ์สไตล์หรูหราเกินความจริง (Lifestyle Inflation) ดึงเงินเก็บออกไป ลองลดมื้อพิเศษลงและโฟกัสอาหารที่มีคุณค่าแต่ประหยัดกระเป๋าดูครับ\n\n`;
    }

    if (transferPercent > 20) {
      advice += `💸 **ระวังเรื่องการโอนให้คนอื่น (${transferPercent.toFixed(0)}% ของรายรับ):** การช่วยเหลือจุนเจือผู้อื่นหรือการมีน้ำใจเป็นสิ่งที่ดีงามอย่างยิ่ง แต่จำกฎเหล็กของคนรวยไว้ว่า "คุณไม่สามารถรดน้ำต้นไม้คนอื่นได้จนน้ำในถังคุณหมด" คุณต้องวางขอบเขตการช่วยเหลือให้ตัวคุณมั่นคงก่อน มิฉะนั้นคุณจะเดือดร้อนเสียเอง\n\n`;
    }

    if (fixedPercent > 45) {
      advice += `🏠 **รูรั่วรายจ่ายประจำเดือน (${fixedPercent.toFixed(0)}% ของรายรับ):** ค่าเช่าหอพัก ค่าน้ำค่าไฟ และค่าเน็ต ถือเป็น 'หนี้สิน' ในมิติการเงินเพราะมันดึงเงินออกจากกระเป๋าคุณทุกเดือนถาวร หากสัดส่วนนี้สูงเกินไป ลองหาหนทางลดภารกิจประจำลง เช่น ปรับโปรค่าเน็ตมือถือ หรือย้ายไปอยู่หอพักที่ราคาสมเหตุสมผลมากขึ้นเพื่อปลดปล่อยเงินสด\n\n`;
    }

    if (unexpectedPercent > 15) {
      advice += `⚠️ **วิกฤตค่าใช้จ่ายไม่คาดคิด (${unexpectedPercent.toFixed(0)}% ของรายรับ):** ค่าซ่อมแซม, ค่าซ่อมรถ หรืออุบัติเหตุเหล่านี้เกิดขึ้นได้ตลอดเวลาและพร้อมทำลายแผนออมเงินของคุณได้เสมอ สิ่งที่คนรวยทำคือการมี "เงินสำรองฉุกเฉิน (Emergency Fund)" แยกต่างหาก 6-12 เท่าของค่าใช้จ่ายรายเดือน เพื่อที่เมื่อเกิดวิกฤต เงินก้อนหลักจะไม่สั่นคลอน คุณควรรีบสร้างกองทุนฉุกเฉินนี้โดยเร็วครับ\n\n`;
    }

    if (foodPercent <= 35 && transferPercent <= 20 && fixedPercent <= 45 && unexpectedPercent <= 15) {
      advice += `✨ **ภาพรวมสมดุลทางการเงิน:** หมวดค่าใช้จ่ายหลักของคุณไม่มีการรั่วไหลที่รุนแรง ถือว่ามีวินัยการเงินที่ดีมาก ขั้นต่อไปคือการเพิ่ม 'รายรับหลายช่องทาง' (Multiple Streams of Income) เพื่อนำเงินเก็บก้อนนี้ไปทำงานแทนคุณครับ!`;
    }
  }

  advSavingsFeedback.textContent = feedback;
  advMindsetText.innerText = advice;

  // Render monthly comparison report (bar chart & grades scorecard)
  renderMonthlyComparisonReport();
}

// Slip File Queue Handling (Batch Scan)
let filesQueue = [];
let queueActive = false;
let processedResults = [];

function handleFiles(files) {
  filesQueue = Array.from(files);
  processedResults = [];
  
  // Hide previous scanned results list
  scannedResultsSection.style.display = 'none';
  scannedResultsContainer.innerHTML = '';

  if (filesQueue.length === 0) return;

  // Show progress bar card
  scanningQueueCard.style.display = 'block';
  queueProgressText.textContent = `0 / ${filesQueue.length}`;
  queueProgressBar.style.width = '0%';
  queueItemsContainer.innerHTML = '';

  // Add files UI to queue
  filesQueue.forEach((file, idx) => {
    const item = document.createElement('div');
    item.className = 'queue-item';
    item.id = `queue-item-${idx}`;
    item.innerHTML = `
      <span class="queue-item-name">${file.name}</span>
      <span class="queue-item-status" id="queue-status-${idx}">
        <i data-lucide="clock"></i> รอคิว...
      </span>
    `;
    queueItemsContainer.appendChild(item);
  });
  lucide.createIcons();

  // Trigger processing
  processNextInQueue(0);
}

// Process OCR Sequentially to avoid crashing browser thread
async function processNextInQueue(index) {
  if (index >= filesQueue.length) {
    // Queue Finished
    queueActive = false;
    setTimeout(() => {
      scanningQueueCard.style.display = 'none';
    }, 1500);

    // Show Scanned results list
    if (processedResults.length > 0) {
      renderScannedResults();
    }
    return;
  }

  queueActive = true;
  const file = filesQueue[index];
  const statusSpan = document.getElementById(`queue-status-${index}`);
  const progressBar = document.getElementById('queue-progress-bar');
  const progressText = document.getElementById('queue-progress-text');

  // Update status UI
  statusSpan.className = 'queue-item-status loading';
  statusSpan.innerHTML = `<i data-lucide="loader" class="icon-spin"></i> กำลังสแกน...`;
  lucide.createIcons();

  try {
    const result = await scanSlipImage(file);
    statusSpan.className = 'queue-item-status success';
    statusSpan.innerHTML = `<i data-lucide="check"></i> สำเร็จ`;
    result.fileBlob = file; // Save the file Blob object inside the result!
    processedResults.push(result);
  } catch (error) {
    console.error('Scan error:', error);
    statusSpan.className = 'queue-item-status fail';
    statusSpan.innerHTML = `<i data-lucide="alert-triangle"></i> ล้มเหลว`;
    // Add default blank values if failed so user can edit manually
    processedResults.push({
      fileName: file.name,
      amount: 0.00,
      title: 'สลิปที่ไม่สำเร็จ: ' + file.name,
      category: '🛒 รายจ่ายทั่วไป/อื่นๆ',
      date: new Date().toISOString().split('T')[0],
      error: true,
      fileBlob: file // Save the file Blob object here too!
    });
  }

  // Update progress bar
  const progressPercent = Math.round(((index + 1) / filesQueue.length) * 100);
  progressBar.style.width = `${progressPercent}%`;
  progressText.textContent = `${index + 1} / ${filesQueue.length}`;
  lucide.createIcons();

  // Recurse next
  setTimeout(() => {
    processNextInQueue(index + 1);
  }, 100);
}

// Client-Side OCR scanner
function scanSlipImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async function() {
      try {
        const imageSrc = reader.result;
        // Call Tesseract
        const { data: { text } } = await Tesseract.recognize(
          imageSrc,
          'tha+eng',
          { logger: m => console.log('Tesseract progress:', m) }
        );

        console.log("OCR Extracted Text:\n", text);

        // Parse slip details using heuristics
        const parsedData = parseSlipTextHeuristic(text);
        parsedData.fileName = file.name;
        resolve(parsedData);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

// Extract Amount, Date, Receiver and classify Category using Regex Heuristics
function parseSlipTextHeuristic(text) {
  // Clean text and replace common OCR misreads of characters
  let cleanText = text.replace(/\s+/g, ' ');

  // 1. EXTRACT AMOUNT
  let amount = 0.00;
  
  // Regex to match decimal numbers like 150.00, 2,500.50, 2500, etc.
  const amountRegex = /(\b\d{1,3}(,\d{3})*\.\d{2}\b)/g;
  const decimalMatches = cleanText.match(amountRegex);

  if (decimalMatches && decimalMatches.length > 0) {
    // Find values which are likely to be amounts
    // Often on bank slips, the transfer amount is the largest decimal number, or it is preceded by terms like "จำนวนเงิน" (amount), "บาท" (baht)
    
    // Look for patterns like "จำนวนเงิน 150.00", "Amount 120.00"
    const keywordAmountRegex = /(?:จำนวนเงิน|ยอดโอน|amount|net|sum|total|เงิน|โอน)\s*(?::|บาท)?\s*(\b\d{1,3}(,\d{3})*\.\d{2}\b)/i;
    const keywordMatch = cleanText.match(keywordAmountRegex);
    
    if (keywordMatch) {
      amount = parseFloat(keywordMatch[1].replace(/,/g, ''));
    } else {
      // Fallback: search for all decimal numbers, convert to float, and find the largest non-zero one
      // (This works well since fee is usually 0.00 and balance in account after transfer is sometimes shown but amount transferred is usually prominent)
      const numbers = decimalMatches.map(m => parseFloat(m.replace(/,/g, '')));
      const nonZeroNumbers = numbers.filter(n => n > 0);
      
      if (nonZeroNumbers.length > 0) {
        // Typically, we take the largest number as the transaction amount (except if it matches date years like 2569 or 2026, but we have decimal points so it's safe)
        amount = Math.max(...nonZeroNumbers);
      }
    }
  }

  // 2. EXTRACT RECEIVER NAME
  let title = 'โอนเงิน';
  
  // Try to find the receiver name.
  // Standard pattern: "โอนให้", "ผู้รับโอน", "ไปยัง", "To:", "Receiver:"
  const receiverRegex = /(?:โอนให้|ผู้รับโอน|ไปยัง|to|receiver|receiver\s*name)\s*(?::)?\s*([ก-๙a-zA-Z.0-9\s]+?)(?=\b(จำนวนเงิน|ยอดเงิน|วันเวลา|date|time|จาก|\d{1,2}\s*[ก-๙]{3}|bank|ref)\b|$)/i;
  const receiverMatch = cleanText.match(receiverRegex);

  if (receiverMatch && receiverMatch[1]) {
    let rawName = receiverMatch[1].trim();
    // Clean up name
    rawName = rawName.replace(/^[.\-\s:]+/, '').trim();
    if (rawName.length > 2 && rawName.length < 50) {
      title = `โอนให้ ${rawName}`;
    }
  }

  // 3. CLASSIFY CATEGORY AUTOMATICALLY
  let category = '🛒 รายจ่ายทั่วไป/อื่นๆ'; // default

  const txtLower = text.toLowerCase();
  
  // Category keywords
  const foodKeywords = ['ก๋วยเตี๋ยว', 'ชาบู', 'ส้มตำ', 'หมูกระทะ', '7-eleven', 'เซเว่น', 'grab', 'foodpanda', 'lineman', 'สุกี้', 'บุฟเฟ่ต์', 'กาแฟ', 'cafe', 'เบเกอรี่', 'อาหาร', 'food', 'shabu', 'starbucks', 'amazon', 'โรตี', 'ข้าว', 'กะเพรา', 'หมูกรอบ', 'สุกี้', 'ร้านค้า', 'ไอศกรีม', 'ice cream'];
  const fixedKeywords = ['ค่าน้ำ', 'ค่าไฟ', 'ค่าเน็ต', 'เน็ต', 'wifi', 'หอพัก', 'อพาร์ทเม้นท์', 'ค่าเช่า', 'rent', 'water', 'electricity', 'ais', 'true', 'dtac', '3bb', 'นิติ', 'นิติบุคคล', 'ค่าส่วนกลาง', 'ประกัน', 'พรีเมียม', 'เน็ตบ้าน', 'ห้องพัก'];
  const unexpectedKeywords = ['ซ่อม', 'พัง', 'อู่', 'ซ่อมรถ', 'อะไหล่', 'ยางรั่ว', 'ใบสั่ง', 'ปรับ', 'ตำรวจ', 'โรงพยาบาล', 'หมอ', 'ค่ายา', 'รักษา', 'อุบัติเหตุ', 'accident', 'fine', 'พยาบาล', 'คลินิก', 'clinic', 'ยา'];
  const transferKeywords = ['นาย', 'นาง', 'นางสาว', 'เด็กชาย', 'เด็กหญิง', 'mr.', 'mrs.', 'miss', 'ms.', 'เพื่อน', 'โอนให้เพื่อน'];

  // Check matching
  if (foodKeywords.some(key => txtLower.includes(key))) {
    category = '🍔 ของกิน';
  } else if (unexpectedKeywords.some(key => txtLower.includes(key))) {
    category = '⚠️ รายจ่ายไม่คาดคิด';
  } else if (fixedKeywords.some(key => txtLower.includes(key))) {
    category = '🏠 รายจ่ายประจำเดือน';
  } else if (transferKeywords.some(key => txtLower.includes(key))) {
    category = '💸 โอนให้คนอื่น';
  }

  // 4. EXTRACT DATE
  let dateString = new Date().toISOString().split('T')[0]; // fallback: today

  // Simple date parsers for slip text:
  // e.g. 16 Jul 2026, 16 ก.ค. 69, 16/07/2026
  const slashDateRegex = /(\d{2})[/-](\d{2})[/-](\d{4})/;
  const slashMatch = cleanText.match(slashDateRegex);
  
  if (slashMatch) {
    let day = slashMatch[1];
    let month = slashMatch[2];
    let year = parseInt(slashMatch[3]);
    // Handle Buddhist Era years (Thai years e.g. 2569 -> 2026)
    if (year > 2400) {
      year -= 543;
    }
    dateString = `${year}-${month}-${day}`;
  } else {
    // Try to match Thai shorthand month (e.g. "16 ก.ค. 69" or "16 ก.ค. 2569")
    const thaiMonths = {
      'ม.ค.': '01', 'ก.พ.': '02', 'มี.ค.': '03', 'เม.ย.': '04',
      'พ.ค.': '05', 'มิ.ย.': '06', 'ก.ค.': '07', 'ส.ค.': '08',
      'ก.ย.': '09', 'ต.ค.': '10', 'พ.ย.': '11', 'ธ.ค.': '12'
    };
    
    for (const [name, num] of Object.entries(thaiMonths)) {
      const matchMonth = new RegExp(`(\\d{1,2})\\s*${name.replace('.', '\\.')}\\s*(\\d{2,4})`);
      const thaiMatch = cleanText.match(matchMonth);
      if (thaiMatch) {
        let day = thaiMatch[1].padStart(2, '0');
        let yrText = thaiMatch[2];
        let year = parseInt(yrText.length === 2 ? '25' + yrText : yrText); // 69 -> 2569
        year -= 543; // BE to AD
        dateString = `${year}-${num}-${day}`;
        break;
      }
    }
  }

  return {
    amount,
    title,
    category,
    date: dateString
  };
}

// Render Extracted Results for Review
function renderScannedResults() {
  scannedResultsSection.style.display = 'block';
  confirmCountSpan.textContent = processedResults.length;
  scannedResultsContainer.innerHTML = '';

  processedResults.forEach((result, idx) => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.id = `result-card-${idx}`;
    card.setAttribute('data-category', result.category);

    card.innerHTML = `
      <div class="result-card-header">
        <span class="result-card-title">${result.fileName}</span>
        <button class="btn-remove-result" onclick="removeScannedResult(${idx})" title="ลบรายการนี้">
          &times; ลบออก
        </button>
      </div>
      <div class="result-inputs">
        <!-- Title Input -->
        <div class="form-group full-width">
          <label>รายการ / โอนให้</label>
          <input type="text" class="form-control" id="res-title-${idx}" value="${result.title}" required>
        </div>

        <!-- Amount Input -->
        <div class="form-group">
          <label>จำนวนเงิน (บาท)</label>
          <input type="number" step="0.01" min="0.01" class="form-control" id="res-amount-${idx}" value="${result.amount}" required>
        </div>

        <!-- Category Input -->
        <div class="form-group">
          <label>หมวดหมู่</label>
          <select class="form-control" id="res-category-${idx}" onchange="updateResultCardCategory(${idx})">
            ${categories.map(cat => `<option value="${cat}" ${cat === result.category ? 'selected' : ''}>${cat}</option>`).join('')}
          </select>
        </div>

        <!-- Date Input -->
        <div class="form-group full-width">
          <label>วันที่</label>
          <input type="date" class="form-control" id="res-date-${idx}" value="${result.date}" required>
        </div>
      </div>
    `;
    scannedResultsContainer.appendChild(card);
  });

  // Action Button to Save all
  btnConfirmAll.onclick = saveAllScannedResults;
}

// Dynamically change card left-border when user changes category
function updateResultCardCategory(idx) {
  const select = document.getElementById(`res-category-${idx}`);
  const card = document.getElementById(`result-card-${idx}`);
  card.setAttribute('data-category', select.value);
}

// Remove single result from bulk preview before saving
function removeScannedResult(idx) {
  processedResults.splice(idx, 1);
  if (processedResults.length === 0) {
    scannedResultsSection.style.display = 'none';
  } else {
    renderScannedResults();
  }
}

// Save All Bulk Scanned Transactions
function saveAllScannedResults() {
  let count = 0;
  
  processedResults.forEach((res, idx) => {
    const titleVal = document.getElementById(`res-title-${idx}`).value.trim();
    const amountVal = parseFloat(document.getElementById(`res-amount-${idx}`).value);
    const categoryVal = document.getElementById(`res-category-${idx}`).value;
    const dateVal = document.getElementById(`res-date-${idx}`).value;

    if (titleVal && !isNaN(amountVal) && amountVal > 0) {
      const txId = 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5) + '_' + idx;
      const hasSlip = !!res.fileBlob;

      const tx = {
        id: txId,
        type: 'expense',
        amount: amountVal,
        title: titleVal,
        category: categoryVal,
        date: dateVal,
        hasSlip: hasSlip
      };

      // Save slip image to IndexedDB
      if (hasSlip) {
        saveSlipImage(txId, res.fileBlob)
          .then(() => console.log('Slip saved:', txId))
          .catch(err => console.error('Slip save error:', err));
      }

      // Insert to head of transactions array
      transactions.unshift(tx);
      count++;
    }
  });

  if (count > 0) {
    saveTransactions();
    populateMonthFilter();
    alert(`บันทึกสำเร็จทั้งหมด ${count} รายการ!`);
    
    // Reset view
    processedResults = [];
    scannedResultsSection.style.display = 'none';
    scannedResultsContainer.innerHTML = '';
    
    // Switch to Dashboard
    switchTab('dashboard');
  }
}

// Perform AI Analysis using free Gemini API Key Client-Side
// Local Intelligent Wealth Simulation Engine (No API Key Required!)
function runWealthSimulation() {
  const targetVal = parseFloat(wealthTargetInput.value) || 1000000;
  const interestAnnual = parseFloat(wealthInterestInput.value) || 6;

  // 1. Calculate financials for selected month (mirroring dashboard data)
  const monthFilter = document.getElementById('db-month-filter');
  const selectedMonth = monthFilter ? monthFilter.value : 'all';

  let totalIncome = 0;
  let totalExpense = 0;
  const categorySums = {
    "🍔 ของกิน": 0,
    "💸 โอนให้คนอื่น": 0,
    "🏠 รายจ่ายประจำเดือน": 0,
    "⚠️ รายจ่ายไม่คาดคิด": 0,
    "🛒 รายจ่ายทั่วไป/อื่นๆ": 0
  };

  // Filter transactions based on selected month
  const filteredTxs = transactions.filter(tx => {
    if (selectedMonth === 'all') return true;
    return tx.date.startsWith(selectedMonth);
  });

  filteredTxs.forEach(tx => {
    if (tx.type === 'income') {
      totalIncome += tx.amount;
    } else if (tx.type === 'expense') {
      totalExpense += tx.amount;
      if (categorySums[tx.category] !== undefined) {
        categorySums[tx.category] += tx.amount;
      } else {
        categorySums["🛒 รายจ่ายทั่วไป/อื่นๆ"] += tx.amount;
      }
    }
  });

  const netSavings = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

  // Show results block
  wealthSimResults.style.display = 'flex';

  // 2. Generate simulation report
  let reportHTML = '';

  // Case A: Savings is negative or zero
  if (netSavings <= 0) {
    reportHTML = `
      <div style="color: var(--expense); font-weight: 700; font-size: 13px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
        <i data-lucide="alert-triangle" style="width: 14px; height: 14px;"></i> แจ้งเตือน: ไม่สามารถคำนวณเป้าหมายความมั่งคั่งได้
      </div>
      <p style="margin-bottom: 12px; color: var(--text-secondary); font-size: 11px;">ในเดือนปัจจุบันนี้ คุณมียอดเงินคงเหลือออมสุทธิเป็น <b>฿${netSavings.toLocaleString()}</b> (ติดลบหรือเท่ากับศูนย์) อัตราการออม: <b>${savingsRate.toFixed(1)}%</b></p>
      
      <div style="background: rgba(239, 68, 68, 0.05); border: 1px dashed rgba(239, 68, 68, 0.2); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
        <div style="font-weight: 700; font-size: 11px; margin-bottom: 4px; color: var(--expense);">คำแนะนำจาก เลขาการเงินอัจฉริยะ (Rich Mindset Advice)</div>
        <p style="font-size: 11px; line-height: 1.5; color: var(--text-muted);">
          💬 <i>"คนทั่วไปมีชีวิตอยู่เพื่อใช้จ่ายสิ่งที่เหลือจากการเก็บออม ส่วนคนรวยออมเงินก่อนจะนำไปใช้จ่ายที่เหลือ"</i><br><br>
          ขณะนี้บัญชีของคุณกำลังเกิดการรั่วไหล เงินเก็บไม่มีสะสม คุณไม่สามารถบรรลุเป้าหมายเงินล้านแรกได้เลยหากยังไม่จัดสรรปันส่วนเงินใหม่ <b>ทางออกเร่งด่วน:</b><br>
          1. <b>จ่ายเงินให้ตัวเองก่อนเสมอ (Pay Yourself First):</b> วันที่เงินเข้าถอนแยก 10% ไปเก็บทันที ห้ามแตะต้อง!<br>
          2. <b>ตัดลดสิ่งที่ไม่จำเป็น:</b> สำรวจตารางด้านล่างและชี้เป้าตัดลดรูรั่วไหลที่เลวร้ายที่สุดด่วนที่สุด
        </p>
      </div>
    `;
  } else {
    // Case B: Savings is positive
    // Scenario 1: Mattress saving (0% return)
    const monthsCash = targetVal / netSavings;
    const yearsCash = (monthsCash / 12).toFixed(1);

    // Scenario 2: Invested saving (compound interest return)
    // Formula: FV = P * (((1 + r)^n - 1) / r)
    // Solving for n: n = ln((FV * r / P) + 1) / ln(1 + r)
    const monthlyRate = (interestAnnual / 100) / 12;
    let monthsInvested = 0;
    let yearsInvested = 0;

    if (monthlyRate === 0) {
      monthsInvested = monthsCash;
    } else {
      const logNumerator = Math.log((targetVal * monthlyRate) / netSavings + 1);
      const logDenominator = Math.log(1 + monthlyRate);
      monthsInvested = Math.ceil(logNumerator / logDenominator);
    }
    yearsInvested = (monthsInvested / 12).toFixed(1);
    const yearsSaved = (parseFloat(yearsCash) - parseFloat(yearsInvested)).toFixed(1);

    // Scorecard grade
    let grade = 'C';
    let gradeColor = '#f59e0b';
    let gradeTitle = 'วินัยระดับพอใช้';
    if (savingsRate >= 30) {
      grade = 'A';
      gradeColor = '#10b981';
      gradeTitle = 'วินัยระดับมหาเศรษฐี (ออมเทพ)';
    } else if (savingsRate >= 15) {
      grade = 'B';
      gradeColor = '#3b82f6';
      gradeTitle = 'วินัยการเงินดี';
    } else if (savingsRate < 0) {
      grade = 'D';
      gradeColor = '#ef4444';
      gradeTitle = 'การเงินวิกฤต (หนี้บาน)';
    }

    reportHTML = `
      <div style="font-weight: 700; font-size: 13px; margin-bottom: 12px; color: var(--text-primary); display: flex; align-items: center; justify-content: space-between;">
        <span>🎯 บทวิเคราะห์ความมั่งคั่งรายบุคคล</span>
        <span style="font-size: 10px; background: ${gradeColor}22; color: ${gradeColor}; padding: 2px 8px; border-radius: 12px; border: 1px solid ${gradeColor}44;">${gradeTitle}</span>
      </div>

      <p style="margin-bottom: 12px; color: var(--text-secondary); font-size: 11px;">
        หากคุณออมเงินระดับเดือนนี้อย่างคงเส้นคงวา (ออมเดือนละ <b>฿${netSavings.toLocaleString()}</b>) สู่เป้าหมาย <b>฿${targetVal.toLocaleString()}</b>:
      </p>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 10px; border-radius: 8px;">
          <div style="font-size: 9px; color: var(--text-muted);">หยอดกระปุกออมทรัพย์ (0% ดอกเบี้ย)</div>
          <div style="font-size: 15px; font-weight: 800; margin-top: 4px; color: #94a3b8;">${yearsCash} ปี</div>
          <div style="font-size: 8px; color: var(--text-muted); margin-top: 2px;">(${Math.ceil(monthsCash)} เดือน)</div>
        </div>
        <div style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); padding: 10px; border-radius: 8px;">
          <div style="font-size: 9px; color: var(--income);">ลงทุนรับปันผล (${interestAnnual}% ต่อปี)</div>
          <div style="font-size: 15px; font-weight: 800; margin-top: 4px; color: var(--income);">${yearsInvested} ปี</div>
          <div style="font-size: 8px; color: var(--income); opacity: 0.8; margin-top: 2px;">(${monthsInvested} เดือน)</div>
        </div>
      </div>

      ${parseFloat(yearsSaved) > 0 ? `
        <div style="background: rgba(16, 185, 129, 0.08); border-left: 3px solid var(--income); padding: 8px 12px; border-radius: 4px; font-size: 10px; line-height: 1.4; color: var(--income); margin-bottom: 12px;">
          💡 <b>พลังแห่งดอกเบี้ยทบต้น:</b> การลงทุนได้ผลตอบแทนเฉลี่ย ${interestAnnual}% ต่อปี ช่วยย่นระยะเวลาให้คุณถึงเป้าหมายได้เร็วขึ้น <b>${yearsSaved} ปี</b>!
        </div>
      ` : ''}
    `;
  }

  // 3. Leak Analysis Section (Sourced from Transaction percentages)
  const foodPercent = totalIncome > 0 ? (categorySums["🍔 ของกิน"] / totalIncome) * 100 : 0;
  const transferPercent = totalIncome > 0 ? (categorySums["💸 โอนให้คนอื่น"] / totalIncome) * 100 : 0;
  const fixedPercent = totalIncome > 0 ? (categorySums["🏠 รายจ่ายประจำเดือน"] / totalIncome) * 100 : 0;
  const unexpectedPercent = totalIncome > 0 ? (categorySums["⚠️ รายจ่ายไม่คาดคิด"] / totalIncome) * 100 : 0;

  let leaksHTML = `
    <div style="font-weight: 700; font-size: 11px; margin-top: 14px; margin-bottom: 6px; color: var(--text-primary);">🪠 วิเคราะห์รูรั่วไหลทางการเงิน:</div>
    <div style="display: flex; flex-direction: column; gap: 6px; font-size: 10px; line-height: 1.4; color: var(--text-secondary);">
  `;

  let hasLeak = false;

  if (foodPercent > 35) {
    hasLeak = true;
    leaksHTML += `
      <div style="background: rgba(245, 158, 11, 0.05); border-left: 2px solid #f59e0b; padding: 6px 10px; border-radius: 4px;">
        🍔 <b>ค่าอาหารสูงมาก (${foodPercent.toFixed(0)}%):</b> คุณจ่ายเงินไปกับค่าของกินหนักเกินควร ลองงดมื้อพิเศษ และควบคุมงบส่วนนี้เพื่อกู้คืนสภาพคล่องออมเงินให้โตขึ้น
      </div>
    `;
  }
  if (transferPercent > 20) {
    hasLeak = true;
    leaksHTML += `
      <div style="background: rgba(245, 158, 11, 0.05); border-left: 2px solid #f59e0b; padding: 6px 10px; border-radius: 4px;">
        💸 <b>โอนให้คนอื่นบ่อย (${transferPercent.toFixed(0)}%):</b> ยอดช่วยเหลือหรือโอนให้บุคคลอื่นค่อนข้างสูง วางขอบเขตก่อนเงินสดในมือจะหมด (อย่าช่วยเหลือคนอื่นจนตนเองเดือดร้อน)
      </div>
    `;
  }
  if (fixedPercent > 45) {
    hasLeak = true;
    leaksHTML += `
      <div style="background: rgba(239, 68, 68, 0.05); border-left: 2px solid var(--expense); padding: 6px 10px; border-radius: 4px;">
        🏠 <b>รายจ่ายประจำดึงเงินเยอะ (${fixedPercent.toFixed(0)}%):</b> ค่าเช่า/น้ำไฟ/เน็ตสูงเกินไป ถือเป็นหนี้สินถาวรที่ดึงกระแสเงินสดคุณทุกเดือน ลองมองหาหอพักราคาเหมาะสม หรือปรับลดโปรค่าโทรศัพท์ลง
      </div>
    `;
  }
  if (unexpectedPercent > 15) {
    hasLeak = true;
    leaksHTML += `
      <div style="background: rgba(239, 68, 68, 0.05); border-left: 2px solid var(--expense); padding: 6px 10px; border-radius: 4px;">
        ⚠️ <b>อุบัติเหตุการเงินไม่คาดคิด (${unexpectedPercent.toFixed(0)}%):</b> ยอดค่าซ่อมแซม/ฉุกเฉินดึงเงินเก็บคุณไป สิ่งที่คุณต้องการเร่งด่วนคือ "เงินสำรองฉุกเฉิน" แยกต่างหากอย่างน้อย 6 เท่าของรายจ่ายประจำ
      </div>
    `;
  }

  if (!hasLeak && totalIncome > 0) {
    leaksHTML += `
      <div style="background: rgba(16, 185, 129, 0.05); border-left: 2px solid var(--income); padding: 8px 10px; border-radius: 4px; color: var(--income);">
        ✨ <b>สุขภาพการเงินสมบูรณ์แบบ:</b> ยอดค่าใช้จ่ายในแต่ละหมวดหมู่ของคุณไม่มีจุดรั่วไหลที่น่ากังวลเลย มีวินัยการเงินยอดเยี่ยมมากครับ!
      </div>
    `;
  }

  leaksHTML += `</div>`;

  // 4. Quote / Rich Mindset Box
  let quote = `💬 <i>"ความมั่งคั่งไม่ได้ขึ้นอยู่กับว่าคุณหาเงินได้เท่าไหร่ แต่อยู่ที่ว่าคุณเก็บเงินได้เท่าไหร่ต่างหาก"</i> - โรเบิร์ต คิโยซากิ (พ่อรวยสอนลูก)`;
  if (savingsRate >= 30) {
    quote = `💬 <i>"จงซื้อสินทรัพย์ไม่ใช่ซื้อหนี้สิน และจ่ายเงินให้ตัวเองก่อนเสมอ"</i> - พลังมหาเศรษฐีของคุณกำลังเริ่มต้นอย่างมั่นคง`;
  } else if (savingsRate < 0) {
    quote = `💬 <i>"รูรั่วเพียงเล็กน้อย ก็สามารถทำให้เรือลำใหญ่ล่มได้เช่นกัน"</i> - จงระวังเศษเงินจ่ายเล็กน้อยที่จ่ายทิ้งขว้างในแต่ละวัน`;
  }

  const quoteHTML = `
    <div style="margin-top: 14px; padding: 10px; background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); border-radius: 8px; font-size: 10.5px; line-height: 1.5; color: var(--text-muted); text-align: center;">
      ${quote}
    </div>
  `;

  // Combine everything and insert into element
  wealthSimText.innerHTML = reportHTML + leaksHTML + quoteHTML;
  lucide.createIcons();
}

// Format Simple Helpers
function formatCurrency(amount) {
  return '฿' + amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateThai(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  
  const thaiMonths = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
  ];
  return `${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
}

// Simple Markdown to HTML formatter for Gemini Response
function formatMarkdownToHTML(mdText) {
  let html = mdText;
  
  // Headers
  html = html.replace(/^### (.*$)/gim, '<h4>$1</h4>');
  html = html.replace(/^## (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^# (.*$)/gim, '<h2>$1</h2>');
  
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Lists
  html = html.replace(/^\s*-\s*(.*$)/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
  
  // Newlines
  html = html.replace(/\n/g, '<br>');
  
  return html;
}

// Populate Month filter dynamically
function populateMonthFilter() {
  const filterSelect = document.getElementById('db-month-filter');
  if (!filterSelect) return;
  
  const previousValue = filterSelect.value;
  filterSelect.innerHTML = '';
  
  // 1. Add "All Time" Option
  const optAll = document.createElement('option');
  optAll.value = 'all';
  optAll.textContent = '📅 ทั้งหมด';
  filterSelect.appendChild(optAll);

  // 2. Add "Current Month" Option
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const optCurrent = document.createElement('option');
  optCurrent.value = currentMonthStr;
  optCurrent.textContent = `📅 เดือนนี้ (${formatMonthThai(currentMonthStr)})`;
  filterSelect.appendChild(optCurrent);
  
  // 3. Get distinct months in transactions list
  const months = [...new Set(transactions.map(tx => tx.date ? tx.date.substr(0, 7) : ''))];
  // Filter out invalid/empty months and current month (to avoid duplication)
  const otherMonths = months.filter(m => m !== currentMonthStr && m && m.match(/^\d{4}-\d{2}$/));
  // Sort months descending (most recent first)
  otherMonths.sort().reverse();
  
  otherMonths.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = `📅 ${formatMonthThai(m)}`;
    filterSelect.appendChild(opt);
  });
  
  // 4. Restore value if still valid
  if (previousValue && Array.from(filterSelect.options).some(opt => opt.value === previousValue)) {
    filterSelect.value = previousValue;
  } else {
    filterSelect.value = currentMonthStr;
  }
}

// Helper to format year-month (e.g. 2026-07) to Thai (กรกฎาคม 2569)
function formatMonthThai(ymStr) {
  if (!ymStr) return '';
  const [year, month] = ymStr.split('-');
  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  const mIdx = parseInt(month) - 1;
  const yrThai = parseInt(year) + 543;
  return `${thaiMonths[mIdx]} ${yrThai}`;
}

// Export data to JSON backup file
function exportData() {
  if (transactions.length === 0) {
    alert('ไม่มีข้อมูลในระบบที่สามารถส่งออกได้');
    return;
  }
  
  const dataObject = {
    appName: "PersonalSecretary_App",
    version: "2.0",
    exportDate: new Date().toISOString(),
    transactions: transactions,
    geminiApiKey: localStorage.getItem('secretary_gemini_key') || ''
  };

  const jsonString = JSON.stringify(dataObject, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `financial_secretary_backup_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Import data from JSON backup file
function importData(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const dataObject = JSON.parse(e.target.result);
      
      // Validation check
      if (dataObject.appName !== "PersonalSecretary_App" || !Array.isArray(dataObject.transactions)) {
        alert('ไฟล์สำรองข้อมูลไม่ถูกต้อง กรุณาอัปโหลดไฟล์ของแอปเลขาส่วนตัวเท่านั้น');
        return;
      }

      if (confirm(`⚠️ ยืนยันการนำเข้าข้อมูล? การทำงานนี้จะนำรายการบันทึกจำนวน ${dataObject.transactions.length} รายการเข้ามาแทนที่ข้อมูลปัจจุบันทั้งหมดในเครื่องนี้`)) {
        transactions = dataObject.transactions;
        saveTransactions();
        
        if (dataObject.geminiApiKey) {
          geminiApiKey = dataObject.geminiApiKey;
          localStorage.setItem('secretary_gemini_key', geminiApiKey);
          geminiApiKeyInput.value = '••••••••••••••••••••';
          geminiChatSection.style.display = 'flex';
        }

        populateMonthFilter();
        updateDashboard();
        renderHistory();
        updateAdvisor();
        alert('นำเข้าข้อมูลการเงินสำเร็จเรียบร้อยแล้ว!');
        // Reset file input value
        document.getElementById('import-file-input').value = '';
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการอ่านไฟล์สำรองข้อมูล: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// Global variable for comparative bar chart instance
let barChartInstance = null;

// Render monthly comparative report (chart & scorecard grades)
function renderMonthlyComparisonReport() {
  const barChartCanvas = document.getElementById('monthlyComparisonChart');
  const barChartContainer = document.getElementById('monthly-bar-chart-container');
  const barChartPlaceholder = document.getElementById('bar-chart-placeholder');
  const gradesContainer = document.getElementById('monthly-grades-container');
  
  if (!barChartCanvas || !gradesContainer) return;

  // Group transactions by month (YYYY-MM)
  const monthlyStats = {};

  transactions.forEach(tx => {
    if (!tx.date) return;
    const monthKey = tx.date.substr(0, 7); // YYYY-MM
    if (!monthKey.match(/^\d{4}-\d{2}$/)) return;

    if (!monthlyStats[monthKey]) {
      monthlyStats[monthKey] = { income: 0, expense: 0 };
    }

    if (tx.type === 'income') {
      monthlyStats[monthKey].income += tx.amount;
    } else if (tx.type === 'expense') {
      monthlyStats[monthKey].expense += tx.amount;
    }
  });

  const monthKeys = Object.keys(monthlyStats).sort(); // Sort chronological ascending

  // If we have less than 1 month, show placeholder and empty container
  if (monthKeys.length === 0) {
    if (barChartContainer) barChartContainer.style.display = 'none';
    if (barChartPlaceholder) barChartPlaceholder.style.display = 'flex';
    gradesContainer.innerHTML = `<div class="chart-placeholder">ยังไม่มีประวัติการเงินรายเดือน</div>`;
    return;
  }

  // Draw comparative bar chart
  // Show chart if there are 2 or more months, else show placeholder
  if (monthKeys.length >= 2) {
    if (barChartContainer) barChartContainer.style.display = 'block';
    if (barChartPlaceholder) barChartPlaceholder.style.display = 'none';

    const labels = monthKeys.map(m => formatMonthThaiShort(m));
    const incomeData = monthKeys.map(m => monthlyStats[m].income);
    const expenseData = monthKeys.map(m => monthlyStats[m].expense);

    if (barChartInstance) {
      barChartInstance.destroy();
    }

    barChartInstance = new Chart(barChartCanvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'รายรับ (฿)',
            data: incomeData,
            backgroundColor: '#10b981', // Emerald Green
            borderRadius: 4
          },
          {
            label: 'รายจ่าย (฿)',
            data: expenseData,
            backgroundColor: '#ef4444', // Rose Red
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8', font: { family: 'Sarabun', size: 9 } }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#94a3b8', font: { family: 'Outfit', size: 9 } }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: '#94a3b8',
              font: { family: 'Sarabun', size: 9 },
              boxWidth: 10
            }
          }
        }
      }
    });
  } else {
    if (barChartContainer) barChartContainer.style.display = 'none';
    if (barChartPlaceholder) barChartPlaceholder.style.display = 'flex';
    barChartPlaceholder.textContent = 'ต้องมีข้อมูลอย่างน้อย 2 เดือนขึ้นไปเพื่อคำนวณกราฟแท่งเปรียบเทียบ';
  }

  // Render Grade Scorecard List (descending order)
  gradesContainer.innerHTML = '';
  const descMonths = [...monthKeys].reverse();

  descMonths.forEach(m => {
    const stats = monthlyStats[m];
    const net = stats.income - stats.expense;
    let savingsRate = 0;
    if (stats.income > 0) {
      savingsRate = Math.round((net / stats.income) * 100);
    } else {
      savingsRate = stats.expense > 0 ? -100 : 0;
    }

    // Determine grade & badge
    let grade = 'C';
    let gradeColor = '#f59e0b'; // Amber
    let gradeName = 'พอใช้';

    if (savingsRate >= 30) {
      grade = 'A';
      gradeColor = '#10b981'; // Green
      gradeName = 'มหาเศรษฐี';
    } else if (savingsRate >= 15) {
      grade = 'B';
      gradeColor = '#3b82f6'; // Blue
      gradeName = 'วินัยดี';
    } else if (savingsRate < 0) {
      grade = 'D';
      gradeColor = '#ef4444'; // Red
      gradeName = 'เงินติดลบ';
    }

    const card = document.createElement('div');
    card.className = 'monthly-grade-item';
    card.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-color);
      border-left: 4px solid ${gradeColor};
      border-radius: 8px;
      margin-bottom: 4px;
    `;

    card.innerHTML = `
      <div>
        <div style="font-size: 13px; font-weight: 700; color: var(--text-primary);">${formatMonthThai(m)}</div>
        <div style="font-size: 10px; color: var(--text-secondary); margin-top: 2px;">
          รับ: <span style="color: var(--income);">฿${stats.income.toLocaleString()}</span> | 
          จ่าย: <span style="color: var(--expense);">฿${stats.expense.toLocaleString()}</span>
        </div>
      </div>
      <div style="text-align: right; display: flex; align-items: center; gap: 10px;">
        <div>
          <div style="font-size: 14px; font-weight: 800; color: ${gradeColor};">เกรด ${grade}</div>
          <div style="font-size: 9px; color: var(--text-muted);">${gradeName} (${savingsRate}%)</div>
        </div>
      </div>
    `;
    
    gradesContainer.appendChild(card);
  });
}

// Helper to format year-month (e.g. 2026-07) to short Thai (ก.ค. 69)
function formatMonthThaiShort(ymStr) {
  if (!ymStr) return '';
  const [year, month] = ymStr.split('-');
  const shortMonths = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
  ];
  const mIdx = parseInt(month) - 1;
  const yrTwoDigits = String(parseInt(year) + 543).slice(-2);
  return `${shortMonths[mIdx]} ${yrTwoDigits}`;
}

// Open Slip Viewer & Category Editor Modal
async function openSlipModal(txId) {
  const tx = transactions.find(t => t.id === txId);
  if (!tx) return;

  currentEditingTxId = txId;

  // Set text details
  slipDetailTitle.textContent = tx.title;
  slipDetailAmount.textContent = '฿' + tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  // Set amount color based on type
  if (tx.type === 'income') {
    slipDetailAmount.style.color = 'var(--income)';
  } else if (tx.type === 'debt') {
    slipDetailAmount.style.color = 'var(--text-primary)';
  } else {
    slipDetailAmount.style.color = 'var(--expense)';
  }

  slipDetailDate.textContent = formatDateThai(tx.date);
  slipDetailCategorySelect.value = tx.category;

  // Render slip image if exists
  if (tx.hasSlip) {
    slipDetailImg.style.display = 'none';
    slipDetailImgPlaceholder.style.display = 'block';
    slipDetailImgPlaceholder.textContent = 'กำลังโหลดรูปภาพสลิป...';

    try {
      const blob = await getSlipImage(txId);
      if (blob) {
        // Revoke any previous object URL to avoid leak
        if (slipDetailImg.src && slipDetailImg.src.startsWith('blob:')) {
          URL.revokeObjectURL(slipDetailImg.src);
        }

        const imgUrl = URL.createObjectURL(blob);
        slipDetailImg.src = imgUrl;
        slipDetailImg.style.display = 'block';
        slipDetailImgPlaceholder.style.display = 'none';
      } else {
        slipDetailImgPlaceholder.textContent = 'ไม่พบรูปสลิปในเครื่องนี้ (อาจถูกลบหรือจัดเก็บในเครื่องอื่น)';
      }
    } catch (err) {
      console.error('Error fetching slip image:', err);
      slipDetailImgPlaceholder.textContent = 'เกิดข้อผิดพลาดในการโหลดรูปภาพสลิป';
    }
  } else {
    slipDetailImg.style.display = 'none';
    slipDetailImgPlaceholder.style.display = 'block';
    slipDetailImgPlaceholder.textContent = 'ไม่มีรูปสลิปแนบไว้สำหรับรายการนี้ (ทำรายการบันทึกมือ)';
  }

  // Show Modal Overlay
  modalViewSlip.classList.add('active');
}

// Close Slip Viewer Modal
function closeSlipModal() {
  modalViewSlip.classList.remove('active');
  
  // Revoke object URL
  if (slipDetailImg.src && slipDetailImg.src.startsWith('blob:')) {
    URL.revokeObjectURL(slipDetailImg.src);
  }
  slipDetailImg.src = '';
  currentEditingTxId = null;
}

// Save Category Edit
function saveSlipCategory() {
  if (!currentEditingTxId) return;

  const tx = transactions.find(t => t.id === currentEditingTxId);
  if (tx) {
    const oldCat = tx.category;
    const newCat = slipDetailCategorySelect.value;
    
    if (oldCat !== newCat) {
      tx.category = newCat;
      saveTransactions();
      
      // Update UI panels
      updateDashboard();
      renderHistory();
      updateAdvisor();
      
      console.log(`Updated transaction ${currentEditingTxId} category from ${oldCat} to ${newCat}`);
    }
  }

  closeSlipModal();
}
