import type { ReactNode } from "react";
import styles from "./Button.module.css";

// Figma Button: Primary / Secondary / Disabled, radius 8.
interface ButtonProps {
  children: ReactNode;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  onClick?: () => void;
}

export default function Button({ children, variant = "primary", disabled, onClick }: ButtonProps) {
  return (
    <button type="button" className={styles.button} data-variant={variant} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
