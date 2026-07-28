const {createConnection} = require('mysql2/promise');
(async()=>{
const conn = await createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute("SELECT osh.id, osh.status, osh.answers, UNIX_TIMESTAMP(osh.createdAt)*1000 as ts FROM orderStatusHistory osh JOIN customers c ON osh.registrationId = c.id WHERE c.name LIKE '%RICARDO%SILVA%' ORDER BY osh.id DESC LIMIT 5");
rows.forEach(r => {
  const ans = r.answers ? JSON.parse(r.answers) : [];
  console.log('Order', r.id, 'status:', r.status, 'date:', new Date(Number(r.ts)).toISOString(), 'answers:', ans.length);
  ans.forEach((p,i) => console.log('  ', i+1, p.question, '->', p.answer));
  console.log('---');
});
await conn.end();
process.exit(0);
})();
