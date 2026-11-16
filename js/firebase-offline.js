import {
  doc,
  addDoc as _addDoc,
  updateDoc as _updateDoc,
  setDoc as _setDoc,
  deleteDoc as _deleteDoc,
  writeBatch as _writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

function sinEspera(promesa) {
  promesa.catch((err) => console.error("Sincronización offline pendiente:", err));
  return new Promise((resolve) => setTimeout(resolve, 120));
}

export async function addDoc(colRef, data) {
  const nuevoRef = doc(colRef);
  await sinEspera(_setDoc(nuevoRef, data));
  return nuevoRef;
}

export const updateDoc = (...args) => sinEspera(_updateDoc(...args));
export const setDoc = (...args) => sinEspera(_setDoc(...args));
export const deleteDoc = (...args) => sinEspera(_deleteDoc(...args));

export function writeBatch(db) {
  const batch = _writeBatch(db);
  const commitOriginal = batch.commit.bind(batch);
  batch.commit = () => sinEspera(commitOriginal());
  return batch;
}
