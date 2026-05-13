export const countdownHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redirecting...</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
    }

    .redirect-container {
      text-align: center;
      padding: 40px;
      max-width: 500px;
    }

    .icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 30px;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.1); opacity: 0.8; }
    }

    h1 {
      font-size: 28px;
      font-weight: 600;
      margin-bottom: 16px;
    }

    .message {
      font-size: 16px;
      color: #a0a0a0;
      margin-bottom: 30px;
    }

    .destination {
      font-size: 14px;
      color: #6b7280;
      background: rgba(255,255,255,0.05);
      padding: 12px 20px;
      border-radius: 8px;
      margin-bottom: 40px;
      word-break: break-all;
    }

    .countdown-wrapper {
      margin-bottom: 40px;
    }

    .countdown-text {
      font-size: 14px;
      color: #a0a0a0;
      margin-bottom: 12px;
    }

    .countdown-number {
      font-size: 64px;
      font-weight: 700;
      color: #3b82f6;
      font-variant-numeric: tabular-nums;
    }

    .progress-bar {
      width: 100%;
      height: 4px;
      background: rgba(255,255,255,0.1);
      border-radius: 2px;
      overflow: hidden;
      margin-top: 16px;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6, #10b981);
      border-radius: 2px;
      transition: width 1s linear;
    }

    .buttons {
      display: flex;
      gap: 16px;
      justify-content: center;
    }

    .btn {
      padding: 12px 32px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
      display: inline-block;
    }

    .btn-primary {
      background: #3b82f6;
      color: #fff;
      border: none;
    }

    .btn-primary:hover {
      background: #2563eb;
      transform: translateY(-2px);
    }

    .btn-secondary {
      background: transparent;
      color: #a0a0a0;
      border: 1px solid rgba(255,255,255,0.2);
    }

    .btn-secondary:hover {
      background: rgba(255,255,255,0.1);
      color: #fff;
    }

    .skip-link {
      display: block;
      margin-top: 24px;
      font-size: 14px;
      color: #6b7280;
      text-decoration: none;
      transition: color 0.2s;
    }

    .skip-link:hover {
      color: #a0a0a0;
    }

    .custom-components {
      margin-top: 40px;
      padding-top: 40px;
      border-top: 1px solid rgba(255,255,255,0.1);
    }
  </style>
</head>
<body>
  <div class="redirect-container">
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M13 5l7 7-7 7M5 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>

    <h1>{{title}}</h1>
    <p class="message">{{message}}</p>

    <div class="destination">{{destinationUrl}}</div>

    <div class="countdown-wrapper">
      <p class="countdown-text">Redirecting in</p>
      <div class="countdown-number" id="countdown">{{countdown}}</div>
      <div class="progress-bar">
        <div class="progress-fill" id="progress" style="width: 100%"></div>
      </div>
    </div>

    <div class="buttons">
      <button class="btn btn-primary" onclick="redirectNow()">Go Now</button>
      <button class="btn btn-secondary" onclick="cancelRedirect()">Cancel</button>
    </div>

    <a href="{{homeUrl}}" class="skip-link">Return to home page</a>

    <div class="custom-components" id="custom-components">
    </div>
  </div>

  <script>
    let seconds = {{countdown}};
    const totalSeconds = seconds;
    const destinationUrl = "{{destinationUrl}}";
    const homeUrl = "{{homeUrl}}";

    const countdownEl = document.getElementById('countdown');
    const progressEl = document.getElementById('progress');

    const interval = setInterval(() => {
      seconds--;
      countdownEl.textContent = seconds;
      progressEl.style.width = ((seconds / totalSeconds) * 100) + '%';

      if (seconds <= 0) {
        clearInterval(interval);
        window.location.href = destinationUrl;
      }
    }, 1000);

    function redirectNow() {
      clearInterval(interval);
      window.location.href = destinationUrl;
    }

    function cancelRedirect() {
      clearInterval(interval);
      window.location.href = homeUrl;
    }
  </script>
</body>
</html>`;