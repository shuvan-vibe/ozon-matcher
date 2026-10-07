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
let minPrice = null;
let maxPrice = null;
let processedUrls = new Set();
let observer = null;
let scrollInterval = null;
let scannedCount = 0;
let captchaNotified = false;

async function initScanner() {
  const data = await chrome.storage.local.get(['isScanning', 'isPaused', 'imageDataUrl', 'matchThreshold', 'minPrice', 'maxPrice']);
  if (!data.isScanning || !data.imageDataUrl) return;

  isScanning = true;
  isPaused = data.isPaused || false;
  matchThreshold = data.matchThreshold || 65;
  minPrice = data.minPrice || null;
  maxPrice = data.maxPrice || null;
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
  refImg.onerror = () => {
    chrome.storage.local.set({ scanStatus: 'Error loading reference image. Scan stopped.' });
    stopScanner('Error loading reference image.');
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
    
    if (document.title.includes('Captcha') && !captchaNotified) {
      captchaNotified = true;
      chrome.runtime.sendMessage({ action: 'captchaDetected' });
      return;
    }

    // Use window.scrollBy instead of scrollIntoView to handle DOM virtualization safely.
    // This ensures it scrolls down from the user's current position without jumping.
    window.scrollBy({ top: window.innerHeight * 0.7, behavior: 'smooth' });
    
  }, 500);
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
    if (card.dataset.matched) continue;
    
    // Grab the actual product image
    const imgEl = card.querySelector('a.tile-clickable-element img') || card.querySelector('a[href*="/product/"] img') || card.querySelector('img');
    if (!imgEl) continue;
    
    let src = imgEl.src || imgEl.dataset.src;
    if (!src || processedUrls.has(src)) continue;
    
    if (src.startsWith('data:')) continue; // Skip lazy placeholders

    card.dataset.scanned = "true";
    processedUrls.add(src);
    
    // Process images in parallel without blocking the loop
    processCard(card, src);
  }
}

async function processCard(card, src) {
  try {
    const result = await chrome.runtime.sendMessage({ action: 'fetchImage', url: src });
    if (!result.success) {
      delete card.dataset.scanned;
      processedUrls.delete(src);
      return;
    }
    
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
        
        chrome.storage.local.get(['matchHistory', 'scanStartTime', 'searchTerm', 'scannedCount'], (data) => {
          let history = data.matchHistory || [];
          const timeTaken = data.scanStartTime ? ((Date.now() - data.scanStartTime) / 1000).toFixed(1) : 0;
          
          history.unshift({
            term: data.searchTerm || 'Unknown',
            percent: matchPercent.toFixed(1),
            count: data.scannedCount || 1,
            time: timeTaken,
            date: new Date().toLocaleString()
          });
          
          if (history.length > 5) history.pop(); // Keep only last 5
          
          chrome.storage.local.set({ 
            matchHistory: history,
            lastMatchTime: timeTaken
          });
        });
      }
    };
    checkImg.onerror = () => {
      console.warn(`Failed to load check image for hash comparison: ${src}`);
      delete card.dataset.scanned;
      processedUrls.delete(src);
    };
    checkImg.src = result.dataUrl;
  } catch (e) {
    console.error('Error checking image:', e);
    delete card.dataset.scanned;
    processedUrls.delete(src);
  }
}

function highlightCard(card, matchPercent) {
  card.dataset.matched = "true";
  card.style.border = '3px solid #39ff14';
  card.style.position = 'relative';
  card.style.transition = 'all 0.3s';
  
  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.top = '10px';
  overlay.style.right = '10px';
  overlay.style.zIndex = '999';
  overlay.style.pointerEvents = 'none';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'flex-end';
  
  const textEl = document.createElement('div');
  textEl.innerText = `✅ MATCH: ${matchPercent.toFixed(1)}%`;
  textEl.style.backgroundColor = '#fff';
  textEl.style.color = '#000';
  textEl.style.fontWeight = 'bold';
  textEl.style.fontSize = '14px';
  textEl.style.padding = '4px 8px';
  textEl.style.borderRadius = '4px';
  textEl.style.marginBottom = '6px';
  textEl.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
  overlay.appendChild(textEl);
  
  const btnContainer = document.createElement('div');
  btnContainer.style.pointerEvents = 'auto'; // allow clicks on buttons
  
  const hideBtn = document.createElement('button');
  hideBtn.innerText = 'OK, hide';
  hideBtn.style.padding = '4px 8px';
  hideBtn.style.backgroundColor = '#28a745';
  hideBtn.style.color = '#fff';
  hideBtn.style.border = 'none';
  hideBtn.style.borderRadius = '4px';
  hideBtn.style.cursor = 'pointer';
  hideBtn.style.fontSize = '12px';
  
  btnContainer.appendChild(hideBtn);
  overlay.appendChild(btnContainer);
  
  function hideOverlay() {
    clearTimeout(hideTimeout);
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    card.style.border = 'none';
  }
  
  let hideTimeout = setTimeout(hideOverlay, 3000);
  
  hideBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideOverlay();
  };
  
  card.appendChild(overlay);
  
  setTimeout(() => {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);
}

function resumeScanner() {
  isScanning = true;
  isPaused = false;
  
  // Clear processed state to catch any cards that were skipped or in-flight when stopped
  // We do NOT clear cards that were successfully matched so we don't re-match them instantly
  processedUrls.clear();
  document.querySelectorAll('.tile-root[data-scanned="true"]:not([data-matched="true"])').forEach(card => {
    delete card.dataset.scanned;
  });

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
  } else if (request.action === 'resumeScan') {
    resumeScanner();
    sendResponse({ success: true });
  }
});

if (window.location.pathname.includes('/search') || window.location.pathname.includes('/category')) {
  setTimeout(initScanner, 1500);
}
