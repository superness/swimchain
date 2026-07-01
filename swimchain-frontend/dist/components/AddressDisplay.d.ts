/**
 * Address display component with copy functionality
 */
import './AddressDisplay.css';
interface AddressDisplayProps {
    /** Full address string (cs1...) */
    address: string;
    /** Number of characters to show at start and end */
    chars?: number;
    /** Show copy button on hover */
    showCopy?: boolean;
    /** Additional CSS class */
    className?: string;
}
export declare function AddressDisplay({ address, chars, showCopy, className, }: AddressDisplayProps): JSX.Element;
export {};
//# sourceMappingURL=AddressDisplay.d.ts.map