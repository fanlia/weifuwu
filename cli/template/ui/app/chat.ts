import { html, raw } from 'weifuwu'

export default function () {
  return html`
  <div>
    <nav class="wu-flex wu-items-center wu-justify-between wu-p-4 wu-border-bottom">
      <strong class="wu-text-lg">weifuwu Chat</strong>
      <a href="/" class="wu-btn wu-btn-sm">← Home</a>
    </nav>

    <section style="max-width: 640px; margin: 40px auto; padding: 0 16px;">
      <h1 class="wu-text-2xl" style="margin-bottom: 16px;">WebSocket Chat</h1>
      <div id="chat-msgs" class="wu-card"
           style="height: 300px; overflow-y: auto; margin-bottom: 12px; padding: 12px;"></div>
      <div class="wu-flex wu-gap-sm">
        <input id="chat-input" class="wu-input" style="flex: 1;" placeholder="Type a message..." />
        <button class="wu-btn wu-btn-primary" onclick="sendMsg()">Send</button>
      </div>
    </section>

    <script>${raw(`
    var ws = new WebSocket('/chat');
    ws.onmessage = function(e) {
      var data = JSON.parse(e.data);
      var div = document.createElement('div');
      div.style.marginBottom = '8px';
      var span = document.createElement('span');
      span.style.whiteSpace = 'pre-wrap';
      span.textContent = data.text || data;
      div.appendChild(span);
      document.getElementById('chat-msgs').appendChild(div);
    };
    function sendMsg() {
      var input = document.getElementById('chat-input');
      var msg = input.value.trim();
      if (!msg) return;
      ws.send(msg);
      input.value = '';
    }
    document.getElementById('chat-input').addEventListener('keyup', function(e) {
      if (e.key === 'Enter') sendMsg();
    });
    `)}</script>
  </div>`
}
