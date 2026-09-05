// Restore user's custom icon on startup
chrome.storage.local.get(['iconIndex'], (data) => {
  if (data.iconIndex) {
    const iconPath = data.iconIndex === 1 ? 'icon128.png' : `icon${data.iconIndex}.png`;
    chrome.action.setIcon({ path: iconPath });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchImage') {
    fetch(request.url)
      .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.blob();
      })
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({ success: true, dataUrl: reader.result });
        };
        reader.readAsDataURL(blob);
      })
      .catch(error => {
        console.error('Error fetching image:', error);
        sendResponse({ success: false, error: error.toString() });
      });
    return true; // Keep message channel open for async sendResponse
  } else if (request.action === 'matchFound') {
    chrome.storage.local.get(['notificationsEnabled'], (data) => {
      if (data.notificationsEnabled !== false) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon128.png',
          title: 'Ozon Matcher',
          message: `Match Found! (${request.matchPercent}% similarity)`,
          priority: 2
        });
      }
    });
    sendResponse({ success: true });
  } else if (request.action === 'captchaDetected') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'Action Required',
      message: 'Ozon is asking for a Captcha verification. Please solve it to resume scanning.',
      priority: 2
    });
    sendResponse({ success: true });
  }
});
