/**
 * 后台布局开关。
 *
 * 经典版（/studio/）不设置，保持原有布局；v2（/studio-v2/）在启动时设为 true。
 * 这样两套页面共用同一份数据/保存/编辑器逻辑，只切换外壳与文章页布局。
 */
let v2 = false;

export function setV2Layout(on: boolean): void {
  v2 = on;
}

export function isV2Layout(): boolean {
  return v2;
}
