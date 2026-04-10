"""TUI — inline display with Rich Live pending panel for bridge ops."""

import threading
import time
from dataclasses import dataclass
from typing import Optional

from rich.console import Console, ConsoleOptions, RenderResult
from rich.live import Live
from rich.text import Text

_R_START, _G_START, _B_START = 0xF5, 0xA6, 0x23
_R_END, _G_END, _B_END = 0xE0, 0x3E, 0x2D
_CYCLE_LENGTH = 20


def _color_for_line(n: int) -> str:
    t = (n % (2 * _CYCLE_LENGTH)) / _CYCLE_LENGTH
    if t > 1:
        t = 2 - t
    r = int(_R_START + (_R_END - _R_START) * t)
    g = int(_G_START + (_G_END - _G_START) * t)
    b = int(_B_START + (_B_END - _B_START) * t)
    return f"rgb({r},{g},{b})"


@dataclass
class _OpEntry:
    command_id: str
    command_type: str
    summary: str


class _LivePanel:
    """Renderable wrapper that re-queries the TUI on every Live refresh.

    Needed so the pairing countdown/blink updates without explicit update() calls.
    """

    def __init__(self, tui: "RunnerTUI") -> None:
        self._tui = tui

    def __rich_console__(
        self, console: Console, options: ConsoleOptions
    ) -> RenderResult:
        yield self._tui._build_panel()


class RunnerTUI:
    def __init__(self, console: Optional[Console] = None) -> None:
        self._console = console or Console()
        self._is_tty = self._console.is_terminal
        self._pending_ops: dict[str, _OpEntry] = {}
        self._line_count = 0
        self._live: Optional[Live] = None
        self._lock = threading.Lock()
        self._pairing_active = False
        self._pairing_deadline: Optional[float] = None
        self._pairing_code: Optional[str] = None
        self._banner_padding = " " * 11
        self._label_width = 13

    def start(self) -> None:
        if self._is_tty:
            self._live = Live(
                _LivePanel(self),
                console=self._console,
                refresh_per_second=8,
                transient=False,
            )
            self._live.start()

    def stop(self) -> None:
        if self._live is not None:
            self._live.stop()
            self._live = None

    def print_banner(
        self,
        project_name: str = "",
        url: str = "",
    ) -> None:
        info = Text()
        info.append("   ")
        info.append("\u2800\u20dd", style="rgb(224,62,45)")
        info.append(" opik  ", style="bold")
        info.append("Opik URL".ljust(self._label_width), style="dim")
        info.append(url)
        if project_name:
            info.append("\n")
            info.append(self._banner_padding)
            info.append("Project".ljust(self._label_width), style="dim")
            info.append(project_name)
        self._console.print(info)

    def pairing_started(self, code: str, timeout_seconds: float) -> None:
        with self._lock:
            self._pairing_active = True
            self._pairing_deadline = time.monotonic() + timeout_seconds
            self._pairing_code = code
        if self._live is None:
            # Non-TTY fallback: live region won't render, so emit the code statically
            text = Text()
            text.append(self._banner_padding)
            text.append("Pairing code: ", style="dim")
            text.append(code, style="bold")
            self._console.print(text)
        self._update_live()

    def pairing_completed(self) -> None:
        with self._lock:
            was_active = self._pairing_active
            self._pairing_active = False
            self._pairing_deadline = None
            self._pairing_code = None
        if not was_active:
            return
        text = Text()
        text.append(self._banner_padding)
        text.append("Status".ljust(self._label_width), style="dim")
        text.append("Paired ", style="green")
        text.append("\u2714", style="green")
        self._print(text)
        self._console.print()
        self._update_live()

    def pairing_failed(self, reason: Optional[str] = None) -> None:
        with self._lock:
            was_active = self._pairing_active
            self._pairing_active = False
            self._pairing_deadline = None
            self._pairing_code = None
        if not was_active:
            return
        text = Text()
        text.append(self._banner_padding)
        text.append("Status".ljust(self._label_width), style="dim")
        text.append("Pairing failed ", style="red")
        text.append("\u2717", style="red")
        if reason:
            text.append(f" {reason}", style="dim red")
        self._print(text)
        self._console.print()
        self._update_live()

    def app_line(self, stream: str, line: str) -> None:
        color = _color_for_line(self._line_count)
        self._line_count += 1
        text = Text()
        text.append(" \u2503  ", style=color)
        text.append(line)
        self._print(text)

    def op_start(self, command_id: str, command_type: str, summary: str) -> None:
        entry = _OpEntry(
            command_id=command_id, command_type=command_type, summary=summary
        )
        with self._lock:
            self._pending_ops[command_id] = entry

        if not self._is_tty:
            return

        self._update_live()

    def op_end(
        self, command_id: str, success: bool, error: Optional[str] = None
    ) -> None:
        with self._lock:
            entry = self._pending_ops.pop(command_id, None)

        if entry is None:
            return

        text = Text()
        if success:
            text.append(" \u25cf ", style="green")
            text.append(entry.summary)
            text.append(" \u2713", style="green")
        else:
            text.append(" \u25cf ", style="red")
            text.append(entry.summary)
            text.append(" \u2717", style="red")
            if error:
                text.append(f" {error}", style="dim red")

        self._print(text)
        self._update_live()

    def child_restarted(self, reason: str) -> None:
        with self._lock:
            self._pending_ops.clear()

        text = Text()
        text.append(" \u2503  ", style="rgb(80,85,245)")
        text.append(f"Restarting: {reason}", style="rgb(80,85,245)")
        self._print(text)

        self._update_live()

    def error(self, message: str) -> None:
        text = Text()
        text.append(" \u25cf ", style="red")
        text.append(message, style="red")
        self._print(text)

    def _print(self, renderable: Text) -> None:
        if self._live is not None:
            self._live.console.print(renderable)
        else:
            self._console.print(renderable)

    def _build_panel(self) -> Text:
        with self._lock:
            ops_snapshot = list(self._pending_ops.values())
            pairing_active = self._pairing_active
            pairing_deadline = self._pairing_deadline
            pairing_code = self._pairing_code

        if not ops_snapshot and not pairing_active:
            return Text("")

        lines = Text()

        if pairing_active and pairing_deadline is not None:
            remaining = max(0, int(pairing_deadline - time.monotonic()))
            mins, secs = divmod(remaining, 60)
            sun_on = int(time.monotonic() * 2) % 2 == 0
            sun_char = "\u2600" if sun_on else " "
            lines.append(self._banner_padding)
            lines.append("Status".ljust(self._label_width), style="dim")
            lines.append("Pairing... ")
            lines.append(sun_char, style="yellow")
            lines.append(f" (timeout in {mins}m {secs:02d}s)", style="dim")
            if pairing_code:
                lines.append("\n\n")
                lines.append(self._banner_padding)
                lines.append("Pairing code: ", style="dim")
                lines.append(pairing_code, style="bold")
                lines.append("\n")
                lines.append(self._banner_padding)
                lines.append("Enter this in Opik to start a connection", style="dim")

        if ops_snapshot:
            if pairing_active:
                lines.append("\n\n")
            separator = "\u2576" + "\u2500" * 46 + "\u2574"
            lines.append(separator, style="dim")
            for entry in ops_snapshot:
                lines.append("\n")
                lines.append(" \u25cf ", style="dim")
                lines.append(entry.summary, style="dim")
                lines.append(" \u23f3", style="dim")
            lines.append("\n")
            lines.append(separator, style="dim")
        return lines

    def _update_live(self) -> None:
        if self._live is not None:
            self._live.refresh()
