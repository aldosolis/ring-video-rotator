# Ring Video Rotator

Adds a rotate button to camera videos on
[account.ring.com](https://account.ring.com). Every click turns that video 90°
clockwise. A video turned sideways is scaled down to fit inside its
original frame.

In live view, the button sits in Ring's control bar, just left of the
fullscreen button. It's found through Ring's `data-testid` attributes, because
Ring's generated class names change between deploys. Videos without that
control bar get a button floating over their top-left corner.

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.

After you edit the files, click the reload icon on the extension's card and
refresh the Ring tab.

## Files

- `manifest.json`: Manifest V3, a content script on `https://account.ring.com/*`. No permissions.
- `content.js`: finds `<video>` elements (including ones added later) and adds the button.
- `content.css`: button styles.

## Limitations

- Rotation resets when Ring swaps in a new video element (for example, opening another event).
- If Ring makes the `<video>` element itself fullscreen, Chrome removes the rotation and hides the button while in fullscreen.
