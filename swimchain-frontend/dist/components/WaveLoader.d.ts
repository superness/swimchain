/**
 * WaveLoader - Animated water waves for loading states
 *
 * A calm, fluid animation inspired by ocean waves.
 */
import './WaveLoader.css';
export interface WaveLoaderProps {
    /** Size variant */
    size?: 'small' | 'medium' | 'large';
    /** Optional loading text */
    text?: string;
    /** Full screen overlay mode */
    fullScreen?: boolean;
    /** Custom color (CSS color value) */
    color?: string;
}
export declare function WaveLoader({ size, text, fullScreen, color, }: WaveLoaderProps): JSX.Element;
/**
 * PageTransition - Wave transition effect between pages
 */
export interface PageTransitionProps {
    /** Whether the transition is active */
    active: boolean;
    /** Direction of the wave */
    direction?: 'up' | 'down';
    /** Callback when transition completes */
    onComplete?: () => void;
}
export declare function PageTransition({ active, direction, onComplete, }: PageTransitionProps): JSX.Element | null;
//# sourceMappingURL=WaveLoader.d.ts.map