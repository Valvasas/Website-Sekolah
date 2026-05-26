'use strict';

const PROGRAMS = [
    { code: 'TBSM', name: 'Teknik Bisnis Sepeda Motor', count: 3 },
    { code: 'TKJ',  name: 'Teknik Komputer & Jaringan', count: 2 },
    { code: 'ATPH', name: 'Agribisnis Tanaman Pangan dan Hortikultura', count: 2 },
    { code: 'AKL',  name: 'Akuntansi & Keuangan Lembaga', count: 1 },
];

const LEVELS = [
    { value: 10, label: 'X' },
    { value: 11, label: 'XI' },
    { value: 12, label: 'XII' },
];

function getSchoolClasses() {
    const rows = [];
    for (const level of LEVELS) {
        for (const program of PROGRAMS) {
            for (let i = 1; i <= program.count; i++) {
                rows.push({
                    kelas: `${level.label} ${program.code} ${i}`,
                    tingkat: level.value,
                    jurusan: program.name,
                    kode_jurusan: program.code,
                    rombel: i,
                });
            }
        }
    }
    return rows;
}

function findSchoolClass(kelas) {
    return getSchoolClasses().find(item => item.kelas === kelas) || null;
}

function isValidSchoolClass(kelas) {
    return Boolean(findSchoolClass(kelas));
}

module.exports = {
    getSchoolClasses,
    findSchoolClass,
    isValidSchoolClass,
};
