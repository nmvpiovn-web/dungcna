const fs = require('fs');
const path = require('path');

const usersPath = path.join(__dirname, '../src/lib/data/users.json');
const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));

const userAuthMapping = {
  'usr_super_1': { username: 'admin', phone: '0901234567', password: 'admin' },
  'usr_super_2': { username: 'msdung', phone: '0912345678', password: 'msdung' },
  'usr_teach_1': { username: 'teacher.john', phone: '0933111222', password: '123' },
  'usr_teach_2': { username: 'nguyen.huong', phone: '0933222333', password: '123' },
  'usr_teach_3': { username: 'tran.mai', phone: '0933333444', password: '123' },
  'usr_student_demo': { username: 'hocsinh', phone: '0988123456', password: '123' },
  'usr_student_1': { username: 'baoanh', phone: '0988000111', password: '123' },
  'usr_student_2': { username: 'giahuy', phone: '0977654321', password: '123' },
  'usr_student_3': { username: 'hoangminh', phone: '0912987654', password: '123' }
};

const updatedUsers = users.map(u => {
  const auth = userAuthMapping[u.id] || {
    username: u.email.split('@')[0].replace(/[^a-z0-9]/gi, ''),
    phone: '0900000000',
    password: '123'
  };
  return {
    ...u,
    username: auth.username,
    phone: auth.phone,
    password: auth.password
  };
});

fs.writeFileSync(usersPath, JSON.stringify(updatedUsers, null, 2), 'utf8');
console.log('Successfully updated users.json with username, phone, and password!');
