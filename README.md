# Fab.com Content Filter

A Chrome extension that filters content on fab.com by hiding items from specific sellers/creators. Also allows hiding items that are already in your library / owned.

## Features

- 🚫 Hide products from specific usernames
- 📚 Hide items already in "My Library"
- 📊 Optional badge showing number of filtered items
- 💾 Syncs across devices via Chrome sync
- 📤 Import/export filter lists as JSON
- ⚡ Real-time filtering with no refresh needed
- 🔒 Privacy focused - no external connections

## Installation

### From the Chrome Extension Store 

[Fab.com Content Filter](https://chromewebstore.google.com/detail/fabcom-seller-username-fi/pjgcfbmdffhjdihbonmmckgihbakhdcp)

### From this Repository

1. Download this repository
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension folder

## Usage

**Add filters:**
- Click extension icon → Type username → Add

**Manage filters:**
- Remove individual usernames
- Clear all filters
- Export/import as JSON

**Settings:**
- Toggle badge counter on/off
- Hide items already saved in "My Library"

## JSON Format

```json
{
  "usernames": ["seller1", "seller2", "seller3"],
  "settings": {
    "hideLibrary": true
  }
}
```

## Notes

- Usernames are case-sensitive
- Works on all fab.com pages including infinite scroll
- Chrome 88+ required (also works with Edge, Brave)
- All data stored locally

## License

MIT