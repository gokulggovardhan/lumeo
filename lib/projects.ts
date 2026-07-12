import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { User } from "firebase/auth";

export type ProjectSummary = {
  id: string;
  title: string;
  status: string;
  type: string;
};

export async function createProject(user: User | null, title: string, type: string) {
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

export function listenToUserProjects(
  userId: string,
  callback: (projects: ProjectSummary[]) => void,
) {
  const projectsRef = collection(db, "projects");
  const q = query(projectsRef, where("ownerId", "==", userId));

  return onSnapshot(q, (snapshot) => {
    const projects = snapshot.docs.map((projectDocument) => {
      const data = projectDocument.data();
      return {
        id: projectDocument.id,
        title: typeof data.title === "string" ? data.title : "Untitled project",
        status: typeof data.status === "string" ? data.status : "Draft",
        type: typeof data.type === "string" ? data.type : "Video Project",
      };
    });

    callback(projects);
  });
}
