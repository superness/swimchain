/**
 * Proof-of-Work progress display with mining tips
 */
import './PowProgress.css';
interface PowProgressProps {
    attempts: number;
    elapsedMs: number;
    difficulty: number;
    onCancel: () => void;
}
export declare function PowProgress({ attempts, elapsedMs, difficulty, onCancel, }: PowProgressProps): JSX.Element;
export {};
//# sourceMappingURL=PowProgress.d.ts.map