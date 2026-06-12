import fs from 'fs';
import path from 'path';

const direktoriSaatIni = '.';

fs.readdir(direktoriSaatIni, (err, files) => {
  if (err) {
    console.error('Gagal membaca direktori:', err);
    process.exit(1);
  }

  console.log('=== Daftar File di Direktori Saat Ini ===');
  if (files.length === 0) {
    console.log('(Direktori kosong)');
  } else {
    files.forEach((file, index) => {
      try {
        const stats = fs.statSync(path.join(direktoriSaatIni, file));
        const tipe = stats.isDirectory() ? '[DIR]' : '[FILE]';
        console.log(`${index + 1}. ${tipe} ${file}`);
      } catch (e) {
        console.log(`${index + 1}. [UNKNOWN] ${file} (Error membaca detail)`);
      }
    });
  }
  console.log('========================================');
});
