export enum PlayerKey {
    Up = 'Up',
    Down = 'Down',
    Left = 'Left',
    Right = 'Right',
    Select = 'Select',
    Back = 'Back',
}

export function mapKey(e: KeyboardEvent): PlayerKey | null {
    switch (e.key) {
        case "ArrowUp": return PlayerKey.Up;
        case "ArrowDown": return PlayerKey.Down;
        case "ArrowLeft": return PlayerKey.Left;
        case "ArrowRight": return PlayerKey.Right;
        case "Enter": return PlayerKey.Select;
        case "Backspace":
        case "Escape": return PlayerKey.Back;
        default: return null;
    }
}
