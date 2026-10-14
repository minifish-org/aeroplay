export default function mount(root: HTMLElement, back: () => void) {
  root.innerHTML = '<main class="game-stage"><h1>Sky Rush</h1><p>Getting ready for your next round.</p><button>Back</button></main>';
  root.querySelector('button')!.addEventListener('click', back);
  return () => {};
}
