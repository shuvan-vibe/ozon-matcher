# Ozon Image Matcher

Ozon Image Matcher is a powerful, lightweight Chrome extension designed to help you find specific products on the Ozon e-commerce platform using an image reference. Instead of relying solely on text search, this extension scans the search results visually, comparing product photos to your reference image to find an exact or highly similar match.

## 🌟 Key Features

- **Automated Visual Scanning:** Automatically scrolls through Ozon search results and scans product images as they load.
- **dHash Comparison Algorithm:** Uses Difference Hash (dHash) to accurately compare images regardless of minor differences in size, aspect ratio, or compression artifacts.
- **Customizable Match Threshold:** Adjust the similarity percentage required for a match (default is 65%). Lower it for screenshots with UI elements, or raise it for strict visual matching.
- **Mobile-Ready:** Fully compatible with Chromium-based mobile browsers (e.g., Kiwi Browser, Yandex Browser). The extension's UI is responsive, and it works flawlessly on both `www.ozon.ru` and `m.ozon.ru`.
- **CORS Bypass:** Uses a background service worker to fetch images directly, bypassing Cross-Origin Resource Sharing restrictions on Ozon's CDNs.

## 🛠️ How It Works

1. **Upload an Image:** Provide a reference image (via upload, drag-and-drop, or paste) and a search term in the extension popup.
2. **Start Scan:** The extension opens a new tab and searches Ozon for your term.
3. **Hashing & Comparison:** As the page auto-scrolls, the content script intercepts the loaded product images, converts them into a 16x16 grayscale grid, and generates a binary hash based on adjacent pixel gradients.
4. **Match Notification:** If a product's hash matches your reference image's hash above the set threshold, the extension stops scrolling, highlights the product in a bright green border, and sends a desktop notification.

## 🚀 Installation (Unpacked)

Since this extension is not yet published to the Chrome Web Store, you can install it manually:

1. Clone or download this repository to your local machine.
2. Open your Chromium-based browser (Chrome, Edge, Brave, Kiwi Browser) and go to the extensions page (e.g., `chrome://extensions/`).
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the folder containing this repository (the folder with the `manifest.json` file).
5. The extension is now installed and ready to use!

## 📱 Mobile Support

To use this on a mobile device, you need an Android browser that supports Chrome extensions, such as **Kiwi Browser**. The installation process is exactly the same—just load the unpacked folder. The popup interface will scale responsively to your phone's screen.

## ⚙️ Technical Details

- **Manifest V3:** Adheres to the latest Chrome extension standards.
- **Permissions:** 
  - `activeTab` and `scripting`: To inject the image scanning logic into Ozon search results.
  - `storage`: To remember your search terms and match settings between uses.
  - `notifications`: To alert you when a match is found or if Ozon triggers a Captcha challenge.
- **Supported Domains:** `*://*.ozon.ru/*`, `*://m.ozon.ru/*`, `*://*.ozone.ru/*`

## 📝 License

This project is open-source and available for personal use and modification.