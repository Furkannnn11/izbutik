import uuid, os
def gid(): return uuid.uuid4().hex[:24].upper()

K = ['proj','appTarget','testTarget','appProduct','testProduct','mainGroup','productsGroup',
     'configGroup','frameworksGroup','appSyncGroup','testSyncGroup',
     'cfgListProj','cfgListApp','cfgListTest',
     'projDebug','projRelease','appDebug','appRelease','testDebug','testRelease',
     'appSources','appResources','appFrameworks','testSources','testFrameworks',
     'testDep','testContainer','baseXC','debugXC','releaseXC','plistException']
i = {k: gid() for k in K}

pbx = f'''// !$*UTF8*$!
{{
	archiveVersion = 1;
	classes = {{
	}};
	objectVersion = 77;
	objects = {{

/* Begin PBXFileReference section */
		{i['appProduct']} = {{isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = "İzbutik Admin.app"; sourceTree = BUILT_PRODUCTS_DIR; }};
		{i['testProduct']} = {{isa = PBXFileReference; explicitFileType = wrapper.cfbundle; includeInIndex = 0; path = IzbutikAdminTests.xctest; sourceTree = BUILT_PRODUCTS_DIR; }};
		{i['baseXC']} = {{isa = PBXFileReference; lastKnownFileType = text.xcconfig; path = Base.xcconfig; sourceTree = "<group>"; }};
		{i['debugXC']} = {{isa = PBXFileReference; lastKnownFileType = text.xcconfig; path = Debug.xcconfig; sourceTree = "<group>"; }};
		{i['releaseXC']} = {{isa = PBXFileReference; lastKnownFileType = text.xcconfig; path = Release.xcconfig; sourceTree = "<group>"; }};
/* End PBXFileReference section */

/* Begin PBXFileSystemSynchronizedBuildFileExceptionSet section */
		{i['plistException']} = {{isa = PBXFileSystemSynchronizedBuildFileExceptionSet; membershipExceptions = (
			Resources/Info.plist,
		); target = {i['appTarget']}; }};
/* End PBXFileSystemSynchronizedBuildFileExceptionSet section */

/* Begin PBXFileSystemSynchronizedRootGroup section */
		{i['appSyncGroup']} = {{isa = PBXFileSystemSynchronizedRootGroup; exceptions = (
			{i['plistException']},
		); path = IzbutikAdmin; sourceTree = "<group>"; }};
		{i['testSyncGroup']} = {{isa = PBXFileSystemSynchronizedRootGroup; path = IzbutikAdminTests; sourceTree = "<group>"; }};
/* End PBXFileSystemSynchronizedRootGroup section */

/* Begin PBXFrameworksBuildPhase section */
		{i['appFrameworks']} = {{isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; }};
		{i['testFrameworks']} = {{isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; }};
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
		{i['mainGroup']} = {{isa = PBXGroup; children = (
			{i['configGroup']},
			{i['appSyncGroup']},
			{i['testSyncGroup']},
			{i['productsGroup']},
		); sourceTree = "<group>"; }};
		{i['configGroup']} = {{isa = PBXGroup; children = (
			{i['baseXC']},
			{i['debugXC']},
			{i['releaseXC']},
		); path = Config; sourceTree = "<group>"; }};
		{i['productsGroup']} = {{isa = PBXGroup; children = (
			{i['appProduct']},
			{i['testProduct']},
		); name = Products; sourceTree = "<group>"; }};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
		{i['appTarget']} = {{isa = PBXNativeTarget; buildConfigurationList = {i['cfgListApp']}; buildPhases = (
			{i['appSources']},
			{i['appFrameworks']},
			{i['appResources']},
		); buildRules = (); dependencies = (); fileSystemSynchronizedGroups = (
			{i['appSyncGroup']},
		); name = IzbutikAdmin; productName = "İzbutik Admin"; productReference = {i['appProduct']}; productType = "com.apple.product-type.application"; }};
		{i['testTarget']} = {{isa = PBXNativeTarget; buildConfigurationList = {i['cfgListTest']}; buildPhases = (
			{i['testSources']},
			{i['testFrameworks']},
		); buildRules = (); dependencies = (
			{i['testDep']},
		); fileSystemSynchronizedGroups = (
			{i['testSyncGroup']},
		); name = IzbutikAdminTests; productName = IzbutikAdminTests; productReference = {i['testProduct']}; productType = "com.apple.product-type.bundle.unit-test"; }};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
		{i['proj']} = {{isa = PBXProject; attributes = {{
			BuildIndependentTargetsInParallel = 1;
			LastSwiftUpdateCheck = 1710;
			LastUpgradeCheck = 1710;
			TargetAttributes = {{
				{i['appTarget']} = {{CreatedOnToolsVersion = 17.0; }};
				{i['testTarget']} = {{CreatedOnToolsVersion = 17.0; TestTargetID = {i['appTarget']}; }};
			}};
		}}; buildConfigurationList = {i['cfgListProj']}; compatibilityVersion = "Xcode 15.0"; developmentRegion = tr; hasScannedForEncodings = 0; knownRegions = (
			tr,
			Base,
		); mainGroup = {i['mainGroup']}; productRefGroup = {i['productsGroup']}; projectDirPath = ""; projectRoot = ""; targets = (
			{i['appTarget']},
			{i['testTarget']},
		); }};
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
		{i['appResources']} = {{isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; }};
/* End PBXResourcesBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
		{i['appSources']} = {{isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; }};
		{i['testSources']} = {{isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; }};
/* End PBXSourcesBuildPhase section */

/* Begin PBXTargetDependency section */
		{i['testDep']} = {{isa = PBXTargetDependency; target = {i['appTarget']}; targetProxy = {i['testContainer']}; }};
/* End PBXTargetDependency section */

/* Begin PBXContainerItemProxy section */
		{i['testContainer']} = {{isa = PBXContainerItemProxy; containerPortal = {i['proj']}; proxyType = 1; remoteGlobalIDString = {i['appTarget']}; remoteInfo = IzbutikAdmin; }};
/* End PBXContainerItemProxy section */

/* Begin XCBuildConfiguration section */
		{i['projDebug']} = {{isa = XCBuildConfiguration; baseConfigurationReference = {i['debugXC']}; buildSettings = {{
			ALWAYS_SEARCH_USER_PATHS = NO;
			CLANG_ANALYZER_NONNULL = YES;
			CLANG_ENABLE_MODULES = YES;
			CLANG_ENABLE_OBJC_ARC = YES;
			ENABLE_STRICT_OBJC_MSGSEND = YES;
			ENABLE_TESTABILITY = YES;
			GCC_C_LANGUAGE_STANDARD = gnu17;
			SWIFT_ACTIVE_COMPILATION_CONDITIONS = "DEBUG $(inherited)";
			SWIFT_OPTIMIZATION_LEVEL = "-Onone";
			SDKROOT = iphoneos;
			DEBUG_INFORMATION_FORMAT = dwarf;
			ONLY_ACTIVE_ARCH = YES;
		}}; name = Debug; }};
		{i['projRelease']} = {{isa = XCBuildConfiguration; baseConfigurationReference = {i['releaseXC']}; buildSettings = {{
			ALWAYS_SEARCH_USER_PATHS = NO;
			CLANG_ANALYZER_NONNULL = YES;
			CLANG_ENABLE_MODULES = YES;
			CLANG_ENABLE_OBJC_ARC = YES;
			ENABLE_NS_ASSERTIONS = NO;
			ENABLE_STRICT_OBJC_MSGSEND = YES;
			GCC_C_LANGUAGE_STANDARD = gnu17;
			SWIFT_COMPILATION_MODE = wholemodule;
			SWIFT_OPTIMIZATION_LEVEL = "-O";
			SDKROOT = iphoneos;
			DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";
			VALIDATE_PRODUCT = YES;
		}}; name = Release; }};
		{i['appDebug']} = {{isa = XCBuildConfiguration; baseConfigurationReference = {i['debugXC']}; buildSettings = {{
			ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;
			CODE_SIGN_STYLE = Automatic;
			CURRENT_PROJECT_VERSION = 1;
			ENABLE_PREVIEWS = YES;
			GENERATE_INFOPLIST_FILE = NO;
			INFOPLIST_FILE = IzbutikAdmin/Resources/Info.plist;
			IPHONEOS_DEPLOYMENT_TARGET = 17.0;
			LD_RUNPATH_SEARCH_PATHS = ("$(inherited)", "@executable_path/Frameworks");
			MARKETING_VERSION = 1.0.0;
			PRODUCT_BUNDLE_IDENTIFIER = com.izbutik.admin;
			PRODUCT_NAME = "İzbutik Admin";
			PRODUCT_MODULE_NAME = IzbutikAdmin;
			SWIFT_EMIT_LOC_STRINGS = YES;
			SWIFT_VERSION = 5.10;
			TARGETED_DEVICE_FAMILY = 1;
		}}; name = Debug; }};
		{i['appRelease']} = {{isa = XCBuildConfiguration; baseConfigurationReference = {i['releaseXC']}; buildSettings = {{
			ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;
			CODE_SIGN_STYLE = Automatic;
			CURRENT_PROJECT_VERSION = 1;
			ENABLE_PREVIEWS = YES;
			GENERATE_INFOPLIST_FILE = NO;
			INFOPLIST_FILE = IzbutikAdmin/Resources/Info.plist;
			IPHONEOS_DEPLOYMENT_TARGET = 17.0;
			LD_RUNPATH_SEARCH_PATHS = ("$(inherited)", "@executable_path/Frameworks");
			MARKETING_VERSION = 1.0.0;
			PRODUCT_BUNDLE_IDENTIFIER = com.izbutik.admin;
			PRODUCT_NAME = "İzbutik Admin";
			PRODUCT_MODULE_NAME = IzbutikAdmin;
			SWIFT_EMIT_LOC_STRINGS = YES;
			SWIFT_VERSION = 5.10;
			TARGETED_DEVICE_FAMILY = 1;
		}}; name = Release; }};
		{i['testDebug']} = {{isa = XCBuildConfiguration; buildSettings = {{
			BUNDLE_LOADER = "$(TEST_HOST)";
			CODE_SIGN_STYLE = Automatic;
			GENERATE_INFOPLIST_FILE = YES;
			IPHONEOS_DEPLOYMENT_TARGET = 17.0;
			PRODUCT_BUNDLE_IDENTIFIER = com.izbutik.admin.tests;
			PRODUCT_NAME = "$(TARGET_NAME)";
			SWIFT_VERSION = 5.10;
			TARGETED_DEVICE_FAMILY = 1;
			TEST_HOST = "$(BUILT_PRODUCTS_DIR)/İzbutik Admin.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/İzbutik Admin";
		}}; name = Debug; }};
		{i['testRelease']} = {{isa = XCBuildConfiguration; buildSettings = {{
			BUNDLE_LOADER = "$(TEST_HOST)";
			CODE_SIGN_STYLE = Automatic;
			GENERATE_INFOPLIST_FILE = YES;
			IPHONEOS_DEPLOYMENT_TARGET = 17.0;
			PRODUCT_BUNDLE_IDENTIFIER = com.izbutik.admin.tests;
			PRODUCT_NAME = "$(TARGET_NAME)";
			SWIFT_VERSION = 5.10;
			TARGETED_DEVICE_FAMILY = 1;
			TEST_HOST = "$(BUILT_PRODUCTS_DIR)/İzbutik Admin.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/İzbutik Admin";
		}}; name = Release; }};
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
		{i['cfgListProj']} = {{isa = XCConfigurationList; buildConfigurations = (
			{i['projDebug']},
			{i['projRelease']},
		); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; }};
		{i['cfgListApp']} = {{isa = XCConfigurationList; buildConfigurations = (
			{i['appDebug']},
			{i['appRelease']},
		); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; }};
		{i['cfgListTest']} = {{isa = XCConfigurationList; buildConfigurations = (
			{i['testDebug']},
			{i['testRelease']},
		); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; }};
/* End XCConfigurationList section */
	}};
	rootObject = {i['proj']};
}}
'''
out = "IzbutikAdmin.xcodeproj/project.pbxproj"
with open(out,"w") as f: f.write(pbx)
print("wrote", out, len(pbx), "bytes")
