import { GoogleGenAI } from '@google/genai';
import readline from 'readline';
import fs from 'fs';
import { execSync } from 'child_process';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("❌ ERROR: API Key tidak ditemukan!");
  process.exit(1);
}

// Gunakan Gemini 3.5 Flash yang emang rajanya Agentic Workflow & 4x lebih cepat!
const ai = new GoogleGenAI({ apiKey: apiKey });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// SYSTEM INSTRUCTION: Memaksa AI memberikan output berformat JSON terstruktur agar bisa dieksekusi mesin
const AGENT_SYSTEM_INSTRUCTION = `
Kamu adalah Autonomous AI Coding Agent. Tugasmu adalah menyelesaikan target coding dari user tanpa berhenti sampai kode tersebut berfungsi sempurna tanpa error.
Kamu memiliki kendali penuh untuk membuat file dan mengujinya melalui terminal.

Setiap kali merespons, kamu WAJIB mengembalikan data dalam format JSON murni tanpa markdown (jangan gunakan \`\`\`json ... \`\`\`), dengan struktur seperti ini:
{
  "pemikiran": "Analisis langkah saat ini dan status error jika ada.",
  "status": "LANJUT" atau "SELESAI",
  "aksi": "BUAT_FILE" atau "TEST_KODE" atau "DIAM",
  "filename": "nama_file_target.js (jika aksi BUAT_FILE)",
  "content": "Isi kode lengkap dalam file tersebut (jika aksi BUAT_FILE)",
  "test_command": "Perintah terminal untuk mengetes kode, misal: 'node nama_file_target.js' (jika aksi TEST_KODE)"
}

Aturan:
1. Jika status "LANJUT", sistem akan mengeksekusi aksimu lalu memberikan hasilnya kembali kepadamu.
2. Jika hasil tes kode memunculkan error, kamu harus menganalisis log error tersebut di turn berikutnya dan memperbaikinya.
3. Jangan set status ke "SELESAI" sebelum kamu yakin kodenya di-test dan berjalan 100% tanpa error!
`;

async function runAgentLoop(targetUser, riwayatPercakapan = []) {
  // Masukkan instruksi awal jika ini turn pertama
  if (riwayatPercakapan.length === 0) {
    riwayatPercakapan.push({
      role: 'user',
      parts: [{ text: `Target Utama: ${targetUser}\nMulai buat filenya dan lakukan pengujian hingga tuntas tanpa error.` }]
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash', // Sangat andal untuk terminal-bench & coding loops
      contents: riwayatPercakapan,
      config: {
        systemInstruction: AGENT_SYSTEM_INSTRUCTION,
        temperature: 0.1, // Dibuat rendah agar logikanya sangat presisi/kaku tidak berhalusinasi
        responseMimeType: "application/json" // Memaksa output berupa JSON valid
      }
    });

    // Parsing perintah dari Gemini
    const keputusanAgent = JSON.parse(response.text.trim());
    
    console.log(`\n🤖 [Pemikiran AI]: ${keputusanAgent.pemikiran}`);
    
    // Simpan respons AI ke riwayat
    riwayatPercakapan.push({ role: 'model', parts: [{ text: response.text }] });

    // Cek apakah tugas sudah dinyatakan selesai oleh AI
    if (keputusanAgent.status === 'SELESAI') {
      console.log("\n🎉 [AGENT] TARGET BERHASIL DICAPAI TANPA ERROR! Selesai.");
      tanyaUser();
      return;
    }

    // Eksekusi aksi otonom berdasarkan perintah JSON AI
    let hasilAksi = "";

    if (keputusanAgent.aksi === 'BUAT_FILE') {
      console.log(`🛠️  [AGENT ACTION] Menulis file: ${keputusanAgent.filename}...`);
      fs.writeFileSync(keputusanAgent.filename, keputusanAgent.content, 'utf8');
      hasilAksi = `Berhasil membuat file ${keputusanAgent.filename}.`;
    } 
    
    else if (keputusanAgent.aksi === 'TEST_KODE') {
      console.log(`🚀 [AGENT ACTION] Menguji kode di terminal via perintah: "${keputusanAgent.test_command}"...`);
      try {
        const output = execSync(keputusanAgent.test_command, { encoding: 'utf8', stdio: 'pipe' });
        hasilAksi = `Hasil Uji Coba BERHASIL/SUKSES.\nOutput:\n${output}`;
        console.log("✅ Uji coba sukses tanpa error runtime!");
      } catch (error) {
        // Jika kodenya error, tangkap log error-nya dan loloskan ke AI untuk dia perbaiki lagi
        hasilAksi = `Hasil Uji Coba GAGAL/ERROR.\nLog Error Terminal:\n${error.stderr || error.message}`;
        console.log("❌ Terdeteksi error! Mengirimkan log error kembali ke AI untuk diperbaiki...");
      }
    }

    // Kirim feedback balik hasil eksekusi ke Gemini untuk iterasi loop berikutnya
    riwayatPercakapan.push({
      role: 'user',
      parts: [{ text: `Hasil Eksekusi Alat:\n${hasilAksi}\nSilakan lanjutkan analisis, lakukan perbaikan jika error, atau ketik SELESAI jika tes sudah sukses.` }]
    });

    // Lanjutkan looping secara otonom (Recursive call)
    await runAgentLoop(targetUser, riwayatPercakapan);

  } catch (err) {
    console.error("Terjadi kendala pada Agent Loop:", err.message);
    tanyaUser();
  }
}

function tanyaUser() {
  rl.question('\n🎯 Masukkan target coding otonom (/goals) atau ketik "exit":\n> ', async (input) => {
    if (input.trim().toLowerCase() === 'exit') {
      rl.close();
      return;
    }
    
    if (input.trim() !== "") {
      console.log("\n🚀 Memulai Agen Otonom... AI akan bekerja hingga tugas tuntas.");
      await runAgentLoop(input.trim());
    } else {
      tanyaUser();
    }
  });
}

console.clear();
console.log("=== AUTONOMOUS GEMINI 3.5 CODING AGENT ===");
tanyaUser();