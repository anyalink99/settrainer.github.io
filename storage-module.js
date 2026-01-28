const Storage = {
  get(key, defaultValue = null) {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  },

  set(key, value) {
    localStorage.setItem(key, value);
  },

  getInt(key, defaultValue = 0) {
    return parseInt(this.get(key, defaultValue));
  },

  getJSON(key, defaultValue = null) {
    const value = this.get(key);
    return value ? JSON.parse(value) : defaultValue;
  },

  setJSON(key, value) {
    this.set(key, JSON.stringify(value));
  }
};
