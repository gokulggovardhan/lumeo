import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function createProject(user: any, title: string, type: string) {
  if (!user) throw new Error("User is not signed in");

  const projectRef = collection(db, "projects");

  await addDoc(projectRef, {
    ownerId: user.uid,
    ownerEmail: user.email || "",
    title,
    type,
    status: "Draft",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function listenToUserProjects(userId: string, callback: (projects: any[]) => void) {
  const projectsRef = collection(db, "projects");
  const q = query(projectsRef, where("ownerId", "==", userId));

  return onSnapshot(q, (snapshot) => {
    const projects = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    callback(projects);
  });
}