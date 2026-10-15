export interface EditableChoiceOption {
    id: string;
    name: string;
}
export interface EditableChoiceProps {
    id: string;
    label: string;
    value: string;
    options: readonly EditableChoiceOption[];
    disabled: boolean;
    placeholder?: string;
    onChange(value: string): void;
    onSelect?(value: string): void;
}
/** Suggestions are advisory; the one input always retains the exact typed value. */
export declare function EditableChoice({ id, label, value, options, disabled, placeholder, onChange, onSelect }: EditableChoiceProps): import("react").JSX.Element;
//# sourceMappingURL=EditableChoice.d.ts.map