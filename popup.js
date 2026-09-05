document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('file-input');
  const dropZone = document.getElementById('drop-zone');
  const previewImg = document.getElementById('preview-img');
  const placeholder = document.querySelector('.placeholder');
  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const clearBtn = document.getElementById('clear-btn');
  const searchTermInput = document.getElementById('search-term');
  const statusEl = document.getElementById('status');
  const thresholdInput = document.getElementById('threshold');
  const thresholdVal = document.getElementById('threshold-val');
  const scanCounter = document.getElementById('scan-counter');
  const scanCountVal = document.getElementById('scan-count-val');
  const changeIconBtn = document.getElementById('change-icon-btn');

  let imageDataUrl = null;
  let currentIconIndex = 1;
  const totalIcons = 4;

  thresholdInput.addEventListener('input', (e) => {
    thresholdVal.textContent = e.target.value + '%';
  });

  // Restore state if scanning
  chrome.storage.local.get(['isScanning', 'searchTerm', 'imageDataUrl', 'scanStatus', 'matchThreshold', 'scannedCount', 'iconIndex'], (data) => {
    if (data.searchTerm) searchTermInput.value = data.searchTerm;
    if (data.imageDataUrl) setImage(data.imageDataUrl);
    if (data.iconIndex) currentIconIndex = data.iconIndex;
    if (data.matchThreshold) {
      thresholdInput.value = data.matchThreshold;
      thresholdVal.textContent = data.matchThreshold + '%';
    }
    if (data.isScanning) {
      setScanningState(true);
      if (data.scannedCount !== undefined) {
        scanCountVal.textContent = data.scannedCount;
      }
    }
    if (data.scanStatus) {
      statusEl.textContent = data.scanStatus;
    }
  });

  function setImage(dataUrl) {
    imageDataUrl = dataUrl;
    previewImg.src = dataUrl;
    previewImg.style.display = 'block';
    placeholder.style.display = 'none';
    updateStartBtn();
  }

  function updateStartBtn() {
    startBtn.disabled = !(imageDataUrl && searchTermInput.value.trim());
  }

  searchTermInput.addEventListener('input', updateStartBtn);
  
  clearBtn.addEventListener('click', () => {
    searchTermInput.value = '';
    updateStartBtn();
  });

  changeIconBtn.addEventListener('click', () => {
    currentIconIndex = (currentIconIndex % totalIcons) + 1;
    const iconPath = currentIconIndex === 1 ? 'icon128.png' : `icon${currentIconIndex}.png`;
    chrome.storage.local.set({ iconIndex: currentIconIndex });
    chrome.action.setIcon({ path: iconPath });
  });

  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) readFile(file);
  });

  document.addEventListener('paste', (e) => {
    const clipboardData = e.clipboardData || window.clipboardData;
    const items = clipboardData.items;
    
    let filePasted = false;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            readFile(file);
            filePasted = true;
            e.preventDefault();
            break;
          }
        }
      }
    }

    if (!filePasted) {
      const text = clipboardData.getData('text');
      if (text && text.trim()) {
        searchTermInput.value = text.trim();
        updateStartBtn();
        e.preventDefault();
      }
    }
  });

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => setImage(e.target.result);
    reader.readAsDataURL(file);
  }

  function setScanningState(isScanning) {
    if (isScanning) {
      startBtn.style.display = 'none';
      stopBtn.style.display = 'block';
      scanCounter.style.display = 'block';
    } else {
      startBtn.style.display = 'block';
      stopBtn.style.display = 'none';
      scanCounter.style.display = 'none';
    }
  }

  startBtn.addEventListener('click', async () => {
    const searchTerm = searchTermInput.value.trim();
    if (!searchTerm || !imageDataUrl) return;

    setScanningState(true);

    const threshold = parseInt(thresholdInput.value, 10) || 65;

    await chrome.storage.local.set({
      searchTerm,
      imageDataUrl,
      matchThreshold: threshold,
      isScanning: true,
      scannedCount: 0,
      scanStatus: 'Starting scan in new tab...'
    });

    const targetUrl = `https://www.ozon.ru/search/?text=${encodeURIComponent(searchTerm)}`;
    chrome.tabs.create({ url: targetUrl });
  });

  stopBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({ isScanning: false, scanStatus: 'Scan manually stopped.' });
    setScanningState(false);
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'stopScan' }, () => {
          // Check lastError to prevent "Uncaught (in promise)" errors in the console
          const ignore = chrome.runtime.lastError;
        });
      }
    });
  });

  // Listen for status updates from content script
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.scanStatus) {
      statusEl.textContent = changes.scanStatus.newValue;
    }
    if (area === 'local' && changes.scannedCount) {
      scanCountVal.textContent = changes.scannedCount.newValue;
    }
    if (area === 'local' && changes.isScanning && !changes.isScanning.newValue) {
      setScanningState(false);
    }
  });
});
