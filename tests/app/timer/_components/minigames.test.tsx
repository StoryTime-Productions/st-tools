import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AimMinigame } from "@/app/timer/_components/minigames/AimMinigame";
import { BricksMinigame } from "@/app/timer/_components/minigames/BricksMinigame";
import { ChampionsList } from "@/app/timer/_components/minigames/ChampionsList";
import { CircleDrawMinigame } from "@/app/timer/_components/minigames/CircleDrawMinigame";
import { CursorSurvivorMinigame } from "@/app/timer/_components/minigames/CursorSurvivorMinigame";
import { DinoMinigame } from "@/app/timer/_components/minigames/DinoMinigame";
import { FlappyArrowMinigame } from "@/app/timer/_components/minigames/FlappyArrowMinigame";
import { MINIGAME_CONFIG, SHAKESPEARE_SNIPPET } from "@/app/timer/_components/minigames/config";
import { TypingSprintMinigame } from "@/app/timer/_components/minigames/TypingSprintMinigame";

describe("timer minigame components", () => {
  it("renders and clicks aim target", () => {
    const onHitTarget = vi.fn();

    render(<AimMinigame targetPosition={{ x: 30, y: 40 }} onHitTarget={onHitTarget} />);

    fireEvent.click(screen.getByRole("button", { name: "Tap target" }));
    expect(onHitTarget).toHaveBeenCalledTimes(1);
  });

  it("renders dino and flappy controls", () => {
    const onJump = vi.fn();
    const onFlap = vi.fn();

    const { rerender } = render(
      <DinoMinigame dinoJumping={false} dinoObstacleX={72} onJump={onJump} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Jump" }));
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Survive the cactus run")).toBeInTheDocument();

    rerender(
      <FlappyArrowMinigame flappyPipeX={70} flappyGapY={42} flappyArrowY={60} onFlap={onFlap} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Flap" }));
    expect(onFlap).toHaveBeenCalledTimes(1);
  });

  it("renders bricks and survivor arenas and forwards mouse movement", () => {
    const onMoveBricks = vi.fn();
    const onMoveSurvivor = vi.fn();

    const { rerender } = render(
      <BricksMinigame
        bricks={[
          { x: 8, y: 8, alive: true },
          { x: 20, y: 8, alive: false },
        ]}
        brickBall={{ x: 50, y: 55 }}
        brickPaddleX={48}
        onMouseMoveArena={onMoveBricks}
      />
    );

    fireEvent.mouseMove(
      screen.getByText("Move your mouse over the arena to control the paddle.")
        .previousElementSibling as Element
    );
    expect(onMoveBricks).toHaveBeenCalled();

    rerender(
      <CursorSurvivorMinigame
        survivorShapes={[{ id: 1, x: 20, y: 20, width: 12, height: 10, ttl: 3 }]}
        onMouseMoveArena={onMoveSurvivor}
      />
    );

    fireEvent.mouseMove(
      screen.getByText("Stay in the black zone and avoid red flash shapes.")
        .previousElementSibling as Element
    );
    expect(onMoveSurvivor).toHaveBeenCalled();
  });

  it("renders typing and drawing minigames and forwards events", () => {
    const onTypingChange = vi.fn();
    const onStartDraw = vi.fn();
    const onContinueDraw = vi.fn();
    const onEndDraw = vi.fn();

    const { rerender } = render(
      <TypingSprintMinigame
        sourceText={SHAKESPEARE_SNIPPET}
        typingValue=""
        onTypingChange={onTypingChange}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("Type continuously..."), {
      target: { value: "To be" },
    });
    expect(onTypingChange).toHaveBeenCalledWith("To be");

    rerender(
      <CircleDrawMinigame
        circlePoints={[
          { x: 10, y: 10 },
          { x: 20, y: 20 },
          { x: 30, y: 15 },
        ]}
        onStartDraw={onStartDraw}
        onContinueDraw={onContinueDraw}
        onEndDraw={onEndDraw}
      />
    );

    const arena = screen.getByText("Draw one full circle around the white origin point.")
      .previousElementSibling as HTMLElement;

    arena.setPointerCapture = vi.fn();

    fireEvent.pointerDown(arena, { pointerId: 7, clientX: 30, clientY: 40 });
    fireEvent.pointerMove(arena, { pointerId: 7, clientX: 35, clientY: 45 });
    fireEvent.pointerUp(arena, { pointerId: 7, clientX: 35, clientY: 45 });

    expect(onStartDraw).toHaveBeenCalled();
    expect(onContinueDraw).toHaveBeenCalled();
    expect(onEndDraw).toHaveBeenCalled();
  });

  it("renders champions and validates config entries", () => {
    render(
      <ChampionsList
        champions={[
          {
            gameKey: "reaction_tap",
            championName: "Nirav",
            championUserId: "u1",
            championScore: 99,
          },
          {
            gameKey: "custom_key",
            championName: "Guest",
            championUserId: null,
            championScore: 12,
          },
        ]}
      />
    );

    expect(screen.getByText("Champions")).toBeInTheDocument();
    expect(screen.getByText(/Aim trainer/)).toBeInTheDocument();
    expect(screen.getByText("custom_key")).toBeInTheDocument();

    expect(Object.keys(MINIGAME_CONFIG)).toEqual([
      "aim",
      "dino",
      "bricks",
      "flappy",
      "typing",
      "circle",
      "survivor",
    ]);
    expect(MINIGAME_CONFIG.aim.key).toBe("reaction_tap");
    expect(MINIGAME_CONFIG.circle.scoreLabel).toBe("Percent");
  });
});
