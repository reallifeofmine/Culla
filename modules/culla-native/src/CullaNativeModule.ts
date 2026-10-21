import { NativeModule, requireNativeModule } from 'expo';

declare class CullaNativeModule extends NativeModule<{}> {}

export default requireNativeModule<CullaNativeModule>('CullaNative');
