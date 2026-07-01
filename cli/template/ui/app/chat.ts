import { html } from 'weifuwu'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function (_ctx: any) {
  return html`<div wu-data='${JSON.stringify({ message: '', logs: [] })}'>
    <nav class="wu-flex wu-items-center wu-justify-between wu-p-4 wu-border-bottom">
      <strong class="wu-text-lg">weifuwu Chat</strong>
      <a href="/" class="wu-btn wu-btn-sm">← Home</a>
    </nav>

    <section style="max-width: 640px; margin: 40px auto; padding: 0 16px;">
      <h1 class="wu-text-2xl" style="margin-bottom: 16px;">WebSocket Chat</h1>

      <div class="wu-card" style="height: 300px; overflow-y: auto; margin-bottom: 12px; padding: 12px;">
        <div wu-each="logs" style="margin-bottom: 8px;">
          <span wu-text="item" style="white-space: pre-wrap;"></span>
        </div>
      </div>

      <div class="wu-flex wu-gap-sm">
        <input wu-model="message" class="wu-input" style="flex: 1;" placeholder="Type a message..." />
        <button class="wu-btn wu-btn-primary" wu-on="click: wu.send(message), message = ''">Send</button>
      </div>
    </section>

    <!-- WebSocket connects to /chat on the same origin -->
    <div wu-ws="/chat"
         wu-on-ws-message="$s.logs = [...$s.logs, JSON.parse(data).text]"></div>
  </div>`
}
