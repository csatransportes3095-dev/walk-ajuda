import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute("SELECT osh.id, osh.status, JSON_LENGTH(osh.answers) as num FROM orderStatusHistory osh WHERE osh.registrationId = (SELECT id FROM customers WHERE name LIKE '%RICARDO%SILVA%SOUZA%' LIMIT 1) ORDER BY osh.id ASC");
rows.forEach(r => console.log(r.id, r.status, 'answers:', r.num));
await conn.end();
process.exit(0);
