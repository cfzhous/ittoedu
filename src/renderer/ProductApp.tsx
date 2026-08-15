import App from './App'

export default function ProductApp() {
  // 不得在此引入匿名包装元素:.app-shell 依赖 html → body → #root 的
  // 100% 高度链贴合窗口,中间任何 auto 高度的父级都会让壳退化为内容高度,
  // 在视口底部露出窗口背景(黑区)。
  return <App />
}
