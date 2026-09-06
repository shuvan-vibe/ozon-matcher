document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const previewImg = document.getElementById('preview-img');
  const placeholder = dropZone.querySelector('.placeholder');
  const imageActions = document.getElementById('image-actions');
  const cropBtn = document.getElementById('crop-btn');
  const autoTrimBtn = document.getElementById('auto-trim-btn');
  const startBtn = document.getElementById('start-btn');
  const continueScanBtn = document.getElementById('continue-scan-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const stopBtn = document.getElementById('stop-btn');
  const clearBtn = document.getElementById('clear-btn');
  const searchTermInput = document.getElementById('search-term');
  const statusEl = document.getElementById('status');
  const thresholdInput = document.getElementById('threshold');
  const thresholdVal = document.getElementById('threshold-val');
  const scanCounter = document.getElementById('scan-counter');
  const scanCountVal = document.getElementById('scan-count-val');
  const scanTimerContainer = document.getElementById('scan-timer-container');
  const scanTimeVal = document.getElementById('scan-time-val');
  const changeIconBtn = document.getElementById('change-icon-btn');
  const historyBtn = document.getElementById('history-btn');
  const historyModal = document.getElementById('history-modal');
  const historyList = document.getElementById('history-list');
  const closeHistoryBtn = document.getElementById('close-history-btn');
  const pasteTextBtn = document.getElementById('paste-text-btn');
  const cropModal = document.getElementById('crop-modal');
  const cropImage = document.getElementById('crop-image');
  const cancelCropBtn = document.getElementById('cancel-crop-btn');
  const saveCropBtn = document.getElementById('save-crop-btn');
  const notificationsToggle = document.getElementById('notifications-toggle');

  let imageDataUrl = null;
  let cropper = null;
  let currentIconIndex = 1;
  const totalIcons = 4;
  let timerInterval = null;
  let currentScanStartTime = null;
  let matchTimeout = null;

  function updateTimerUI() {
    if (!currentScanStartTime) return;
    const elapsed = ((Date.now() - currentScanStartTime) / 1000).toFixed(1);
    scanTimeVal.textContent = elapsed + 's';
  }

  thresholdInput.addEventListener('input', (e) => {
    thresholdVal.textContent = e.target.value + '%';
    chrome.storage.local.set({ matchThreshold: e.target.value });
  });

  document.querySelectorAll('.threshold-marks span').forEach(mark => {
    mark.addEventListener('click', (e) => {
      const val = e.target.getAttribute('data-val');
      thresholdInput.value = val;
      thresholdVal.textContent = val + '%';
      chrome.storage.local.set({ matchThreshold: val });
    });
  });

  chrome.storage.local.get(['isScanning', 'isPaused', 'searchTerm', 'imageDataUrl', 'scanStatus', 'matchThreshold', 'scannedCount', 'iconIndex', 'scanStartTime', 'lastMatchTime', 'notificationsEnabled'], (data) => {
    if (data.searchTerm) searchTermInput.value = data.searchTerm;
    if (data.imageDataUrl) {
      imageDataUrl = data.imageDataUrl;
      previewImg.src = data.imageDataUrl;
      previewImg.style.display = 'block';
      imageActions.style.display = 'flex';
      placeholder.style.display = 'none';
    }
    if (data.iconIndex) currentIconIndex = data.iconIndex;
    if (data.matchThreshold) {
      thresholdInput.value = data.matchThreshold;
      thresholdVal.textContent = data.matchThreshold + '%';
    }
    
    if (data.notificationsEnabled === false) {
      notificationsToggle.checked = false;
    }
    
    if (data.lastMatchTime) {
      scanTimerContainer.style.display = 'block';
      scanTimeVal.textContent = data.lastMatchTime + 's';
    }
    
    if (data.isScanning) {
      currentScanStartTime = data.scanStartTime;
      scanTimerContainer.style.display = 'block';
      if (!data.isPaused && currentScanStartTime) {
        timerInterval = setInterval(updateTimerUI, 100);
      }
      setScanningState(true, data.isPaused);
      if (data.scannedCount !== undefined) {
        scanCountVal.textContent = data.scannedCount;
        scanCounter.style.display = 'block';
      }
    } else {
      if (data.scannedCount > 0) scanCounter.style.display = 'block';
    }
    if (data.scanStatus) {
      statusEl.textContent = data.scanStatus;
    }
    
    // Ensure the Start Scan button is enabled if inputs are populated from storage
    updateStartBtn();
  });

  function handleImageUpload(dataUrl) {
    imageDataUrl = dataUrl;
    previewImg.src = dataUrl;
    previewImg.style.display = 'block';
    imageActions.style.display = 'flex';
    placeholder.style.display = 'none';
    chrome.storage.local.set({ imageDataUrl });
    updateStartBtn();
  }

  function updateStartBtn() {
    startBtn.disabled = !(imageDataUrl && searchTermInput.value.trim());
    if (continueScanBtn && continueScanBtn.style.display === 'block') {
       if (matchTimeout) clearTimeout(matchTimeout);
       continueScanBtn.style.display = 'none';
       startBtn.style.display = 'block';
    }
  }

  searchTermInput.addEventListener('input', (e) => {
    chrome.storage.local.set({ searchTerm: e.target.value });
    updateStartBtn();
  });
  
  pasteTextBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        searchTermInput.value = text;
        chrome.storage.local.set({ searchTerm: text });
        updateStartBtn();
      }
    } catch (err) {
      console.error('Failed to read clipboard text: ', err);
    }
  });

  clearBtn.addEventListener('click', () => {
    searchTermInput.value = '';
    chrome.storage.local.remove(['searchTerm']);
    updateStartBtn();
  });

  notificationsToggle.addEventListener('change', (e) => {
    chrome.storage.local.set({ notificationsEnabled: e.target.checked });
  });

  changeIconBtn.addEventListener('click', () => {
    currentIconIndex = (currentIconIndex % totalIcons) + 1;
    const iconPath = currentIconIndex === 1 ? 'icon128.png' : `icon${currentIconIndex}.png`;
    chrome.storage.local.set({ iconIndex: currentIconIndex });
    chrome.action.setIcon({ path: iconPath });
  });

  function readFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => handleImageUpload(e.target.result);
    reader.readAsDataURL(file);
  }

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
    reader.onload = (e) => handleImageUpload(e.target.result);
    reader.readAsDataURL(file);
  }

  // Auto-Trim Button (Smart Layout Crop)
  autoTrimBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!imageDataUrl) return;
    
    const img = new Image();
    img.onload = () => {
      let cropX = 0, cropY = 0, cropW = img.width, cropH = img.height;
      let isSmartCrop = false;

      if (img.height > img.width * 1.3) {
        // Case 1: Mobile Ozon Card
        // Product images can be square (1:1) or tall (3:4).
        // We crop down to 62% of the height to safely include tall products while avoiding the price/buttons.
        cropX = 0;
        cropY = 0;
        cropW = img.width;
        cropH = img.height * 0.62;
        isSmartCrop = true;
      } else if (img.width > img.height * 1.1) {
        // Case 2: Desktop Ozon Screenshot
        // Standard layout: Blue header at top (~8%), thumbnails on left (~10%).
        cropX = img.width * 0.10;
        cropY = img.height * 0.08;
        // Don't cut off the bottom! Extend it all the way down to 92%.
        cropH = img.height * 0.92;
        // Main image takes up about 55% of the width
        cropW = img.width * 0.55; 
        isSmartCrop = true;
      } else {
        // Case 3: Square-ish image, fallback to mathematical border trim
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width; canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        
        const bgR = data[0], bgG = data[1], bgB = data[2], bgA = data[3];
        const tolerance = 20; 
        function isBg(r, g, b, a) {
          if (a === 0 && bgA === 0) return true;
          return Math.abs(r - bgR) <= tolerance && Math.abs(g - bgG) <= tolerance && Math.abs(b - bgB) <= tolerance;
        }
        
        let t = 0, b = canvas.height, l = 0, r = canvas.width;
        outTop: for (let y = 0; y < canvas.height; y++) { for (let x = 0; x < canvas.width; x++) { let i = (y * canvas.width + x) * 4; if (!isBg(data[i], data[i+1], data[i+2], data[i+3])) { t = y; break outTop; } } }
        outBottom: for (let y = canvas.height - 1; y >= 0; y--) { for (let x = 0; x < canvas.width; x++) { let i = (y * canvas.width + x) * 4; if (!isBg(data[i], data[i+1], data[i+2], data[i+3])) { b = y + 1; break outBottom; } } }
        outLeft: for (let x = 0; x < canvas.width; x++) { for (let y = t; y < b; y++) { let i = (y * canvas.width + x) * 4; if (!isBg(data[i], data[i+1], data[i+2], data[i+3])) { l = x; break outLeft; } } }
        outRight: for (let x = canvas.width - 1; x >= 0; x--) { for (let y = t; y < b; y++) { let i = (y * canvas.width + x) * 4; if (!isBg(data[i], data[i+1], data[i+2], data[i+3])) { r = x + 1; break outRight; } } }
        
        if (t < b && l < r && !(t === 0 && b === canvas.height && l === 0 && r === canvas.width)) {
          cropX = l; cropY = t; cropW = r - l; cropH = b - t;
          isSmartCrop = true;
        }
      }
      
      if (!isSmartCrop) {
        const originalText = autoTrimBtn.innerText;
        autoTrimBtn.innerText = '✅';
        setTimeout(() => { autoTrimBtn.innerText = originalText; }, 1000);
        return;
      }
      
      const trimCanvas = document.createElement('canvas');
      trimCanvas.width = cropW;
      trimCanvas.height = cropH;
      const trimCtx = trimCanvas.getContext('2d');
      // Fix potential out-of-bounds rendering by filling background with white first
      trimCtx.fillStyle = '#ffffff';
      trimCtx.fillRect(0, 0, cropW, cropH);
      trimCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      
      handleImageUpload(trimCanvas.toDataURL('image/png'));
      
      const originalText = autoTrimBtn.innerText;
      autoTrimBtn.innerText = '✂️✨';
      setTimeout(() => { autoTrimBtn.innerText = originalText; }, 1000);
    };
    img.src = imageDataUrl;
  });

  // Manual Crop Button
  cropBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // prevent triggering dropZone click
    if (!imageDataUrl) return;
    cropImage.src = imageDataUrl;
    cropModal.style.display = 'flex';
    cropper = new Cropper(cropImage, {
      viewMode: 1,
      autoCropArea: 1,
      responsive: true
    });
  });

  cancelCropBtn.addEventListener('click', () => {
    if (cropper) {
      cropper.destroy();
      cropper = null;
    }
    cropModal.style.display = 'none';
  });

  saveCropBtn.addEventListener('click', () => {
    if (cropper) {
      const canvas = cropper.getCroppedCanvas();
      if (canvas) {
        setImage(canvas.toDataURL());
      }
      cropper.destroy();
      cropper = null;
    }
    cropModal.style.display = 'none';
  });
  
  historyBtn.addEventListener('click', () => {
    chrome.storage.local.get(['matchHistory'], (data) => {
      const history = data.matchHistory || [];
      historyList.innerHTML = '';
      if (history.length === 0) {
        historyList.innerHTML = '<i>No matches yet.</i>';
      } else {
        history.forEach(item => {
          historyList.innerHTML += `
            <div class="history-item">
              <div class="history-title">🔍 ${item.term}</div>
              <div class="history-stats">
                <span>Match: ${item.percent}%</span>
                <span>Time: ${item.time}s</span>
                <span>Scanned: ${item.count}</span>
              </div>
              <div style="font-size: 10px; color: #777; margin-top: 4px; text-align: right;">${item.date}</div>
            </div>
          `;
        });
      }
      historyModal.style.display = 'flex';
    });
  });

  closeHistoryBtn.addEventListener('click', () => {
    historyModal.style.display = 'none';
  });

  function setScanningState(isScanning, isPaused = false, isMatch = false) {
    if (isScanning) {
      startBtn.style.display = 'none';
      if (continueScanBtn) continueScanBtn.style.display = 'none';
      pauseBtn.style.display = 'block';
      stopBtn.style.display = 'block';
      scanCounter.style.display = 'block';
      scanTimerContainer.style.display = 'block';
      
      if (isPaused) {
        pauseBtn.innerText = '▶ Resume';
        pauseBtn.style.backgroundColor = '#28a745';
        pauseBtn.style.color = '#fff';
      } else {
        pauseBtn.innerText = '⏸ Pause';
        pauseBtn.style.backgroundColor = '#ffc107';
        pauseBtn.style.color = '#000';
      }
    } else {
      pauseBtn.style.display = 'none';
      stopBtn.style.display = 'none';
      
      if (isMatch && continueScanBtn) {
        startBtn.style.display = 'none';
        continueScanBtn.style.display = 'block';
        
        if (matchTimeout) clearTimeout(matchTimeout);
        matchTimeout = setTimeout(() => {
          continueScanBtn.style.display = 'none';
          startBtn.style.display = 'block';
        }, 30000);
      } else {
        startBtn.style.display = 'block';
        if (continueScanBtn) continueScanBtn.style.display = 'none';
      }
      // Deliberately NOT hiding scanCounter and scanTimerContainer so they persist
    }
  }

  if (continueScanBtn) {
    continueScanBtn.addEventListener('click', async () => {
      if (matchTimeout) clearTimeout(matchTimeout);
      
      setScanningState(true, false);
      chrome.storage.local.set({ isScanning: true, isPaused: false, scanStatus: 'Resuming scan...' });
      
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'resumeScan' }, () => {
            const ignore = chrome.runtime.lastError;
          });
        }
      });
    });
  }

  startBtn.addEventListener('click', async () => {
    const searchTerm = searchTermInput.value.trim();
    if (!searchTerm || !imageDataUrl) return;

    setScanningState(true, false);
    
    currentScanStartTime = Date.now();
    scanCountVal.textContent = '0';
    scanTimeVal.textContent = '0.0s';
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimerUI, 100);

    const threshold = parseInt(thresholdInput.value, 10) || 65;

    await chrome.storage.local.set({
      searchTerm,
      imageDataUrl,
      matchThreshold: threshold,
      isScanning: true,
      isPaused: false,
      scannedCount: 0,
      scanStartTime: currentScanStartTime,
      lastMatchTime: null,
      scanStatus: 'Starting scan in new tab...'
    });

    const targetUrl = `https://www.ozon.ru/search/?text=${encodeURIComponent(searchTerm)}`;
    chrome.tabs.create({ url: targetUrl });
  });

  pauseBtn.addEventListener('click', () => {
    chrome.storage.local.get(['isPaused'], (data) => {
      const newPausedState = !data.isPaused;
      chrome.storage.local.set({ 
        isPaused: newPausedState,
        scanStatus: newPausedState ? 'Scan paused.' : 'Scanning page...'
      });
      setScanningState(true, newPausedState);
      
      if (newPausedState) {
        if (timerInterval) clearInterval(timerInterval);
      } else {
        if (!timerInterval) timerInterval = setInterval(updateTimerUI, 100);
      }
    });
  });

  stopBtn.addEventListener('click', async () => {
    if (timerInterval) clearInterval(timerInterval);
    await chrome.storage.local.set({ isScanning: false, isPaused: false, scanStatus: 'Scan manually stopped.' });
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
      if (timerInterval) clearInterval(timerInterval);
      chrome.storage.local.get(['scanStatus'], (data) => {
        if (data.scanStatus && data.scanStatus.includes('Match found')) {
          setScanningState(false, false, true);
        } else {
          setScanningState(false, false, false);
        }
      });
    }
    if (area === 'local' && changes.isPaused) {
      // Sync pause state if changed from another popup instance
      chrome.storage.local.get(['isScanning'], (data) => {
        if (data.isScanning) {
          setScanningState(true, changes.isPaused.newValue);
        }
      });
    }
  });
});
