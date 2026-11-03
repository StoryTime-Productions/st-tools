import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

function Harness() {
  const form = useForm<{ name: string }>({ defaultValues: { name: "" } });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(
          () => undefined,
          () => undefined
        )}
        noValidate
      >
        <FormField
          control={form.control}
          name="name"
          rules={{ required: "Name is required" }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <input {...field} />
              </FormControl>
              <FormDescription>Use your real name.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <button type="submit">Save</button>
      </form>
    </Form>
  );
}

function MessageHarness() {
  const form = useForm<{ name: string }>({ defaultValues: { name: "" } });

  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <input aria-label="Name" {...field} />
            </FormControl>
            <FormMessage>Choose a name</FormMessage>
          </FormItem>
        )}
      />
    </Form>
  );
}

describe("FormMessage", () => {
  it("shows supplied text plainly when the field has no error", () => {
    render(<MessageHarness />);

    const message = screen.getByText("Choose a name");
    expect(message).not.toHaveAttribute("role");
    expect(message.querySelector("svg")).toBeNull();
  });

  it("announces a field error with a decorative icon", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Name is required");
    expect(alert.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("FormDescription", () => {
  it("shows the hint until the field has an error, then lets the error speak", async () => {
    render(<Harness />);
    expect(screen.getByText("Use your real name.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    // while it has an error the field is described by the error, not by the hint that stepped aside
    const described = screen.getByLabelText("Name").getAttribute("aria-describedby") ?? "";
    expect(described.split(" ")).toHaveLength(1);
    expect(document.getElementById(described)).toHaveTextContent("Name is required");
    await waitFor(() => expect(screen.queryByText("Use your real name.")).not.toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ada" } });
    expect(await screen.findByText("Use your real name.")).toBeInTheDocument();
    expect(screen.queryByText("Name is required")).not.toBeInTheDocument();
  });
});
