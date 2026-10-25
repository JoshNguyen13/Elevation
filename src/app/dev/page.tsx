import { notFound } from "next/navigation";
import DevLab from "@/components/dev/DevLab";
import styles from "../page.module.css";

// Dev Lab: build any run (pieces, disaster, build time) and play it locally. Dev only.
export default function DevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className={styles.main}>
      <DevLab />
    </main>
  );
}
