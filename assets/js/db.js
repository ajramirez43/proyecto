import alasql from "https://cdn.jsdelivr.net/npm/alasql@4.4.0/dist/alasql.mjs";

export const initDB = () => {
    alasql("CREATE LOCALSTORAGE DATABASE IF NOT EXISTS vitalguard_db");
    alasql("ATTACH LOCALSTORAGE DATABASE vitalguard_db");
    alasql("USE vitalguard_db");

    alasql(`CREATE TABLE IF NOT EXISTS users (uid STRING PRIMARY KEY, fullName STRING, email STRING, password STRING, age INT, hypertension BOOLEAN, diabetes BOOLEAN, emergencyName STRING, emergencyPhone STRING, medicalNotes STRING)`);
    alasql(`CREATE TABLE IF NOT EXISTS vitals (id STRING PRIMARY KEY, userId STRING, systolic INT, diastolic INT, glucose INT, pulse INT, timestamp DATETIME)`);
    alasql(`CREATE TABLE IF NOT EXISTS medications (id STRING PRIMARY KEY, userId STRING, name STRING, dose STRING, freq STRING, createdAt DATETIME)`);
    alasql(`CREATE TABLE IF NOT EXISTS symptoms (id STRING PRIMARY KEY, userId STRING, symptoms STRING, notes STRING, timestamp DATETIME)`);
    alasql(`CREATE TABLE IF NOT EXISTS caregivers (id STRING PRIMARY KEY, userId STRING, email STRING)`);
};

export const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);
export const getUser = () => {
    const u = localStorage.getItem('vitalguard_user');
    return u ? JSON.parse(u) : null;
};
export const logout = () => {
    localStorage.removeItem('vitalguard_user');
    window.location.href = 'index.html';
};

export const registerUser = (user) => {
    try {
        const exists = alasql("SELECT * FROM users WHERE email = ?", [user.email]);
        if(exists.length > 0) return { success: false, message: "Correo ya registrado" };
        alasql("INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?,?)", 
            [user.uid, user.fullName, user.email, user.password, user.age, user.hypertension, user.diabetes, user.emergencyName, user.emergencyPhone, user.medicalNotes]);
        return { success: true };
    } catch (e) { return { success: false, message: e.message }; }
};

export const loginUser = (email, pass) => {
    const res = alasql("SELECT * FROM users WHERE email = ? AND password = ?", [email, pass]);
    if(res.length > 0) {
        localStorage.setItem('vitalguard_user', JSON.stringify(res[0]));
        return { success: true };
    }
    return { success: false };
};

export { alasql };