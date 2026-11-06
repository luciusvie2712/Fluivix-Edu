export function gradeError(
  score: string | null,
  maxScore: string,
): string | null {
  if (score === null) return null;
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(score))
    return "Nhập số không âm, tối đa hai chữ số thập phân.";
  const hundredths = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  };
  return hundredths(score) > hundredths(maxScore)
    ? `Điểm không được vượt ${maxScore}.`
    : null;
}
