// Runtime overlay injected into the target page. It NEVER touches the app's
// own DOM nodes or code — it only appends its own fixed-position,
// pointer-events:none elements on top:
//   • a fake cursor that glides to each click target (so viewers can follow)
//   • a click "pulse" ring
//   • a caption bar (burned into the recording — readable with sound off)
//   • full-screen intro/outro title cards
// Everything lives under window.__demoOverlay.
//
// Installed BOTH as a context init script (so it re-appears if a beat's click
// navigates to a new document) and via page.evaluate after load. The install
// is idempotent and defers to DOMContentLoaded when the body doesn't exist
// yet (init scripts run at document start).

export const OVERLAY_INSTALL = `
(() => {
  if (window.__demoOverlayInstalling) return;
  window.__demoOverlayInstalling = true;

  const install = () => {
    if (window.__demoOverlay) return;

    const style = document.createElement('style');
    style.textContent = \`
      #__demo-cursor {
        position: fixed; left: 0; top: 0; width: 26px; height: 26px;
        border-radius: 50%; box-sizing: border-box;
        background: rgba(255,255,255,.9); border: 2.5px solid rgba(20,20,25,.65);
        box-shadow: 0 2px 10px rgba(0,0,0,.45), inset 0 0 4px rgba(0,0,0,.15);
        transform: translate(-50%,-50%);
        transition: left .5s cubic-bezier(.35,.75,.35,1), top .5s cubic-bezier(.35,.75,.35,1), opacity .3s;
        opacity: 0; pointer-events: none; z-index: 2147483645;
      }
      .__demo-pulse {
        position: fixed; width: 26px; height: 26px; border-radius: 50%;
        border: 3px solid rgba(255,255,255,.95); box-shadow: 0 0 12px rgba(255,255,255,.6);
        transform: translate(-50%,-50%) scale(1); opacity: .9;
        pointer-events: none; z-index: 2147483645;
        animation: __demo-pulse-anim .55s ease-out forwards;
      }
      @keyframes __demo-pulse-anim {
        to { transform: translate(-50%,-50%) scale(2.6); opacity: 0; }
      }
      #__demo-caption {
        position: fixed; left: 50%; bottom: 46px; transform: translateX(-50%);
        max-width: 74%; box-sizing: border-box;
        background: rgba(10,11,15,.84); color: #fff;
        font: 600 31px/1.35 -apple-system, BlinkMacSystemFont, 'Helvetica Neue', system-ui, sans-serif;
        letter-spacing: .01em; text-align: center;
        padding: 15px 30px; border-radius: 15px;
        box-shadow: 0 4px 24px rgba(0,0,0,.35);
        opacity: 0; transition: opacity .35s ease;
        pointer-events: none; z-index: 2147483644;
      }
      #__demo-card {
        position: fixed; inset: 0; display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 22px;
        padding: 0 10%; text-align: center; box-sizing: border-box;
        background: radial-gradient(1300px 750px at 50% 40%, #202836 0%, #0a0d13 72%);
        color: #fff; opacity: 0; transition: opacity .55s ease;
        pointer-events: none; z-index: 2147483646;
        font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', system-ui, sans-serif;
      }
      #__demo-card .__t { font-size: 66px; font-weight: 800; line-height: 1.15; letter-spacing: -.015em;
        text-shadow: 0 2px 18px rgba(0,0,0,.5); }
      #__demo-card .__s { font-size: 31px; font-weight: 500; line-height: 1.4; color: #a7b7cd; }
    \`;
    document.head.appendChild(style);

    const cursor = document.createElement('div');
    cursor.id = '__demo-cursor';
    document.body.appendChild(cursor);

    const caption = document.createElement('div');
    caption.id = '__demo-caption';
    document.body.appendChild(caption);

    const card = document.createElement('div');
    card.id = '__demo-card';
    card.innerHTML = '<div class="__t"></div><div class="__s"></div>';
    document.body.appendChild(card);

    window.__demoOverlay = {
      cursorTo(x, y) {
        cursor.style.opacity = '1';
        cursor.style.left = x + 'px';
        cursor.style.top = y + 'px';
      },
      clickPulse(x, y) {
        const p = document.createElement('div');
        p.className = '__demo-pulse';
        p.style.left = x + 'px';
        p.style.top = y + 'px';
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 700);
      },
      showCaption(text) {
        caption.textContent = text;
        caption.style.opacity = '1';
      },
      hideCaption() { caption.style.opacity = '0'; },
      showCard(title, subtitle) {
        card.querySelector('.__t').textContent = title || '';
        card.querySelector('.__s').textContent = subtitle || '';
        card.style.opacity = '1';
      },
      hideCard() { card.style.opacity = '0'; },
    };
  };

  if (document.body) install();
  else document.addEventListener('DOMContentLoaded', install, { once: true });
})();
`;
