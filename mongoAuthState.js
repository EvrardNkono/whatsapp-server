const mongoose = require('mongoose');

const AuthSchema = new mongoose.Schema({ _id: String, data: String });
const Auth = mongoose.models.WaAuth || mongoose.model('WaAuth', AuthSchema);

async function useMongoAuthState() {
  const { BufferJSON, initAuthCreds, proto } = await import('@whiskeysockets/baileys');

  const write = (id, value) =>
    Auth.updateOne({ _id: id }, { data: JSON.stringify(value, BufferJSON.replacer) }, { upsert: true });
  const read = async (id) => {
    const doc = await Auth.findById(id);
    return doc ? JSON.parse(doc.data, BufferJSON.reviver) : null;
  };
  const remove = (id) => Auth.deleteOne({ _id: id });

  const creds = (await read('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await read(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? write(key, value) : remove(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => write('creds', creds),
  };
}

const clearAuth = () => Auth.deleteMany({});

module.exports = { useMongoAuthState, clearAuth };