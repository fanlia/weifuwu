import { html, raw } from 'weifuwu'

export default function () {
  return html`<div x-data="{ message: '', logs: [], ws: null }"
              x-init="
                ws = new WebSocket('/chat');
                ws.onmessage = (e) => { logs = [...logs, JSON.parse(e.data).text] };
                ws.onopen = () => {};
              ">
    <nav class="wu-flex wu-items-center wu-justify-between wu-p-4 wu-border-bottom">
      <strong class="wu-text-lg">weifuwu Chat</strong>
      <a href="/" class="wu-btn wu-btn-sm">← Home</a>
    </nav>

    <section style="max-width: 640px; margin: 40px auto; padding: 0 16px;">
      <h1 class="wu-text-2xl" style="margin-bottom: 16px;">WebSocket Chat</h1>

      <div class="wu-card" style="height: 300px; overflow-y: auto; margin-bottom: 12px; padding: 12px;">
        <template x-for="(msg, i) in logs" :key="i">
          <div style="margin-bottom: 8px;">
            <span style="white-space: pre-wrap;" x-text="msg"></span>
          </div>
        </template>
      </div>

      <div class="wu-flex wu-gap-sm">
        <input x-model="message" class="wu-input" style="flex: 1;" placeholder="Type a message..."
               @keyup.enter="if (message.trim()) { ws.send(message); message = '' }" />
        <button class="wu-btn wu-btn-primary"
                @click="if (message.trim()) { ws.send(message); message = '' }">Send</button>
      </div>
    </section>
  </div>`
}
