interface PatternTagProps {
  tag: string;
}

export function PatternTag({ tag }: PatternTagProps) {
  return (
    <span className="inline-flex items-center rounded-md bg-plum/30 px-2 py-0.5 text-xs text-primary">
      {tag}
    </span>
  );
}
