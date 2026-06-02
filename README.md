# TouchQue MCP Server

Model Context Protocol (MCP) sunucusudur. Bu proje, TouchQue platformunun mimarisini, dökümantasyonunu ve güvenlik standartlarını yapay zeka kodlama asistanlarına (Claude, Cursor, Github Copilot vb.) sağlamak amacıyla oluşturulmuştur.

## En Son Eklenen Özellikler (Yeni!)
* **TouchQue System Prompting:** MCP Server, AI asistanının güvenlik açıklarına yol açmaması (örneğin AES E2E payload şifrelemesini bozmaması) için katı "System Prompts" (`get_system_prompts`) sunar.
* **Yapay Zeka Araçları (Tools):** Geliştiricilerin AI asistanlarına TouchQue SDK entegrasyonu kodlatabilmesi için `get_sdk_docs`, `validate_integration` gibi özel AI komutları (tools) eklendi.

## Teknolojiler
* **Platform:** Node.js (Express.js)
* **Protokol:** `@modelcontextprotocol/sdk`
* **Transport:** HTTP / SSE (Server-Sent Events)

## Kurulum (Localhost)

1. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```

## Çalıştırma
```bash
# Port 5174'te başlatır (veya .env'de tanımlanan PORT'ta)
npm start 
```

## Çevre Değişkenleri (.env)
* `PORT` (Varsayılan: 5174)
* `API_KEY` (MCP sunucusuna yetkisiz AI asistanı erişimini engellemek için)
