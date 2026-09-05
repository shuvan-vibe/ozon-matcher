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
    if (sender.tab && sender.tab.id) {
      chrome.action.setBadgeText({ text: '!', tabId: sender.tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#FF0000', tabId: sender.tab.id });
    }
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'Ozon Matcher',
      message: `Match Found! (${request.matchPercent}% similarity)`,
      priority: 2
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
