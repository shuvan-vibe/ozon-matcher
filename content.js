// Difference Hash implementation
function getImageData(img, size = 16) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size);
}

function computeDHash(img) {
  const size = 16;
  const imgData = getImageData(img, size + 1);
  const data = imgData.data;
  
  let hash = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p1Idx = (y * (size + 1) + x) * 4;
      const p2Idx = (y * (size + 1) + (x + 1)) * 4;
      
      const p1Gray = data[p1Idx] * 0.3 + data[p1Idx + 1] * 0.59 + data[p1Idx + 2] * 0.11;
      const p2Gray = data[p2Idx] * 0.3 + data[p2Idx + 1] * 0.59 + data[p2Idx + 2] * 0.11;
      
      hash += p1Gray < p2Gray ? '1' : '0';
    }
  }
  return hash;
}

function hashDistance(hash1, hash2) {
  let diff = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) diff++;
  }
  return diff;
}

// Global state
let isScanning = false;
let isPaused = false;
let refHash = null;
let matchThreshold = 65;
let processedUrls = new Set();
let observer = null;
let scrollInterval = null;
let scannedCount = 0;
let captchaNotified = false;

async function initScanner() {
  const data = await chrome.storage.local.get(['isScanning', 'isPaused', 'imageDataUrl', 'matchThreshold']);
  if (!data.isScanning || !data.imageDataUrl) return;

  isScanning = true;
  isPaused = data.isPaused || false;
  matchThreshold = data.matchThreshold || 65;
  processedUrls.clear();
  scannedCount = 0;
  chrome.storage.local.set({ scanStatus: 'Computing reference hash...', scannedCount: 0 });

  const refImg = new Image();
  refImg.onload = () => {
    refHash = computeDHash(refImg);
    if (!isPaused) {
      chrome.storage.local.set({ scanStatus: 'Scanning page...' });
      startObserver();
      scanCurrentCards();
      startAutoScroll();
    } else {
      chrome.storage.local.set({ scanStatus: 'Scan paused.' });
    }
  };
  refImg.src = data.imageDataUrl;
}

function stopScanner(message = 'Scan stopped') {
  isScanning = false;
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (scrollInterval) {
    clearInterval(scrollInterval);
    scrollInterval = null;
  }
  chrome.storage.local.set({ isScanning: false, scanStatus: message });
}

function startAutoScroll() {
  scrollInterval = setInterval(() => {
    if (!isScanning || isPaused) {
      clearInterval(scrollInterval);
      scrollInterval = null;
      return;
    }
    // Ozon scroll fix: find the last card and scroll it into view
    const cards = document.querySelectorAll('.tile-root');
    if (cards.length > 0) {
      captchaNotified = false;
      cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'end' });
    } else if (document.title.includes('Captcha') && !captchaNotified) {
      captchaNotified = true;
      chrome.runtime.sendMessage({ action: 'captchaDetected' });
    }
    // If there are no cards (e.g., during a Captcha challenge), we simply do nothing and wait.
  }, 1200);
}

function startObserver() {
  if (observer) observer.disconnect();
  observer = new MutationObserver((mutations) => {
    if (!isScanning || isPaused) return;
    for (let mutation of mutations) {
      if (mutation.addedNodes.length) {
        scanCurrentCards();
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

async function scanCurrentCards() {
  if (!isScanning) return;
  const cards = document.querySelectorAll('.tile-root');
  
  for (let card of cards) {
    if (!isScanning) break;
    if (card.dataset.scanned) continue;
    
    // Grab the actual product image
    const imgEl = card.querySelector('a.tile-clickable-element img') || card.querySelector('a[href*="/product/"] img') || card.querySelector('img');
    if (!imgEl) continue;
    
    let src = imgEl.src || imgEl.dataset.src;
    if (!src || processedUrls.has(src)) continue;
    
    if (src.startsWith('data:')) continue; // Skip lazy placeholders

    card.dataset.scanned = "true";
    processedUrls.add(src);
    
    try {
      const result = await chrome.runtime.sendMessage({ action: 'fetchImage', url: src });
      if (!result.success) continue;
      
      const checkImg = new Image();
      checkImg.onload = () => {
        if (!isScanning || isPaused) return;
        const targetHash = computeDHash(checkImg);
        const diff = hashDistance(refHash, targetHash);
        const matchPercent = 100 - (diff / refHash.length) * 100;
        
        scannedCount++;
        chrome.storage.local.set({ scannedCount });
        
        console.log(`Match percent for ${src}: ${matchPercent.toFixed(2)}% (Threshold: ${matchThreshold}%)`);
        
        if (matchPercent >= matchThreshold) {
          highlightCard(card, matchPercent);
          chrome.runtime.sendMessage({ action: 'matchFound', matchPercent: matchPercent.toFixed(1) });
          stopScanner(`Found match! (${matchPercent.toFixed(1)}%)`);
        }
      };
      checkImg.src = result.dataUrl;
    } catch (e) {
      console.error('Error checking image:', e);
    }
  }
}

function highlightCard(card, matchPercent) {
  card.style.border = '5px solid #39ff14';
  card.style.position = 'relative';
  card.style.transform = 'scale(1.05)';
  card.style.transition = 'all 0.3s';
  card.style.boxShadow = '0 0 20px rgba(57, 255, 20, 0.5)';
  
  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.backgroundColor = 'rgba(57, 255, 20, 0.2)';
  overlay.style.color = '#000';
  overlay.style.fontWeight = 'bold';
  overlay.style.fontSize = '18px';
  overlay.style.textAlign = 'center';
  overlay.style.padding = '10px';
  overlay.style.zIndex = '999';
  overlay.style.boxSizing = 'border-box';
  overlay.style.pointerEvents = 'none';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.justifyContent = 'center';
  overlay.style.alignItems = 'center';
  
  const textEl = document.createElement('div');
  textEl.innerText = `MATCH FOUND: ${matchPercent.toFixed(1)}%`;
  overlay.appendChild(textEl);
  
  const continueBtn = document.createElement('button');
  continueBtn.innerText = 'Not this one? Continue';
  continueBtn.style.pointerEvents = 'auto'; // allow clicks
  continueBtn.style.marginTop = '10px';
  continueBtn.style.padding = '6px 12px';
  continueBtn.style.backgroundColor = '#dc3545';
  continueBtn.style.color = '#fff';
  continueBtn.style.border = 'none';
  continueBtn.style.borderRadius = '4px';
  continueBtn.style.cursor = 'pointer';
  continueBtn.style.fontSize = '14px';
  
  continueBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Dim highlight
    card.style.border = '3px solid #ffc107';
    card.style.boxShadow = 'none';
    card.style.transform = 'none';
    overlay.style.backgroundColor = 'rgba(255, 193, 7, 0.1)';
    textEl.innerText = `Skipped (${matchPercent.toFixed(1)}%)`;
    textEl.style.color = '#666';
    continueBtn.style.display = 'none';
    
    resumeScanner();
  };
  
  overlay.appendChild(continueBtn);
  card.appendChild(overlay);
  
  setTimeout(() => {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);
}

function resumeScanner() {
  isScanning = true;
  isPaused = false;
  chrome.storage.local.set({ isScanning: true, isPaused: false, scanStatus: 'Scanning page...' });
  startObserver();
  scanCurrentCards();
  startAutoScroll();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.isPaused) {
    isPaused = changes.isPaused.newValue;
    if (isPaused) {
      if (observer) { observer.disconnect(); observer = null; }
      if (scrollInterval) { clearInterval(scrollInterval); scrollInterval = null; }
    } else {
      if (isScanning) {
        startObserver();
        scanCurrentCards();
        startAutoScroll();
      }
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startScan') {
    initScanner();
    sendResponse({ success: true });
  } else if (request.action === 'stopScan') {
    stopScanner();
    sendResponse({ success: true });
  }
});

if (window.location.pathname.includes('/search') || window.location.pathname.includes('/category')) {
  setTimeout(initScanner, 1500);
}
