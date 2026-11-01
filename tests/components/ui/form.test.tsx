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
