import { SignUp } from "@clerk/nextjs";

export default function SignUpPage(): React.JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50">
      <SignUp
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-lg",
          },
        }}
      />
    </div>
  );
}
