export const instant = false;

// Each accounting page renders its own header with the accounting tabs under it
// (AccountingPageHeader); detail pages show the tabs above their own heading.
export default function AccountingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="mx-auto w-full max-w-[1480px]">{children}</div>;
}
