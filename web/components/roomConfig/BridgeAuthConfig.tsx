import { FunctionComponent, createRef } from "preact";
import { useCallback, useState } from "preact/hooks"
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { BridgeConfig } from "../../BridgeAPI";
import { BridgeAuthConnectionState, BridgeAuthResponseItem } from "../../../src/Connections/BridgeAuthConnection";
import { ConnectionConfigurationProps, RoomConfig } from "./RoomConfig";
import { InputField, ButtonSet, Button } from "../elements";
import WebhookIcon from "../../icons/webhook.png";

const EXAMPLE_SCRIPT = `if (data.counter === undefined) {
    result = {
        empty: true,
        version: "v2"
    };
  } else if (data.counter > data.maxValue) {
    result = {
          plain: \`**Oh no!** The counter has gone over by \${data.counter - data.maxValue}\`,
          version: "v2"
    };
  } else {
    result = {
          plain: \`*Everything is fine*, the counter is under by \${data.maxValue - data.counter}\`,
          version: "v2"
    };
  }`;

const DOCUMENTATION_LINK = "https://matrix-org.github.io/matrix-hookshot/latest/setup/webhooks.html#script-api";
const CODE_MIRROR_EXTENSIONS = [javascript({})];

const ConnectionConfiguration: FunctionComponent<ConnectionConfigurationProps<ServiceConfig, BridgeAuthResponseItem, BridgeAuthConnectionState>> = ({serviceConfig, existingConnection, onSave, onRemove, isUpdating}) => {
    const [transFn, setTransFn] = useState<string>(existingConnection?.config.transformationFunction as string || EXAMPLE_SCRIPT);
    const [transFnEnabled, setTransFnEnabled] = useState(serviceConfig.allowJsTransformationFunctions && !!existingConnection?.config.transformationFunction);
    const [waitForComplete, setWaitForComplete] = useState(existingConnection?.config.waitForComplete ?? false);

    const nameRef = createRef<HTMLInputElement>();

    const canEdit = !existingConnection || (existingConnection?.canEdit ?? false);
    const handleSave = useCallback((evt: Event) => {
        evt.preventDefault();
        if (!canEdit) {
            return;
        }
        onSave({
            name: nameRef?.current?.value || existingConnection?.config.name || "BridgeAuth Endpoint",
            waitForComplete,
            ...(transFnEnabled ? { transformationFunction: transFn } : undefined),
        });
    }, [canEdit, onSave, nameRef, transFn, existingConnection, transFnEnabled, waitForComplete]);

    return <form onSubmit={handleSave}>
        <InputField visible={!existingConnection} label="Friendly name" noPadding={true}>
            <input ref={nameRef} disabled={!canEdit} placeholder="My Bridge Auth endpoint" type="text" value={existingConnection?.config.name} />
        </InputField>

        <InputField visible={!!existingConnection} label="URL" noPadding={true}>
            <input disabled={true} placeholder="URL hidden" type="text" value={existingConnection?.secrets?.url || ""} />
        </InputField>

        <InputField visible={serviceConfig.allowJsTransformationFunctions} label="Enable Transformation JavaScript" noPadding={true}>
            <input disabled={!canEdit} type="checkbox" checked={transFnEnabled} onChange={useCallback(() => setTransFnEnabled(v => !v), [])} />
        </InputField>


        <InputField visible={serviceConfig.allowJsTransformationFunctions && transFnEnabled} label="Respond after function completes" noPadding={true}>
            <input disabled={!canEdit || serviceConfig.waitForComplete} type="checkbox" checked={waitForComplete || serviceConfig.waitForComplete} onChange={useCallback(() => setWaitForComplete(v => !v), [])} />
        </InputField>

        <InputField visible={transFnEnabled} noPadding={true}>
            <CodeMirror
                value={transFn}
                extensions={CODE_MIRROR_EXTENSIONS}
                onChange={setTransFn}
            />
            <p> See the <a target="_blank" rel="noopener noreferrer" href={DOCUMENTATION_LINK}>documentation</a> for help writing transformation functions </p>
        </InputField>
        <ButtonSet>
            { canEdit && <Button disabled={isUpdating} type="submit">{ existingConnection ? "Save" : "Add BridgeAuth webhook" }</Button>}
            { canEdit && existingConnection && <Button disabled={isUpdating} intent="remove" onClick={onRemove}>Remove BridgeAuth webhook</Button>}
        </ButtonSet>
    </form>;
};

interface ServiceConfig {
    allowJsTransformationFunctions: boolean,
    waitForComplete: boolean,
}

const RoomConfigText = {
    header: 'BridgeAuth Webhooks',
    createNew: 'Create new BridgeAuth webhook',
    listCanEdit: 'Your BridgeAuth webhooks',
    listCantEdit: 'Configured BridgeAuth webhooks',
};

const RoomConfigListItemFunc = (c: BridgeAuthResponseItem) => c.config.name;

export const BridgeAuthConfig: BridgeConfig = ({ api, roomId, showHeader }) => {
    return <RoomConfig<ServiceConfig, BridgeAuthResponseItem, BridgeAuthConnectionState>
        headerImg={WebhookIcon}
        showHeader={showHeader}
        api={api}
        roomId={roomId}
        type="bridge_auth"
        connectionEventType="gk.bridgeas.bridge_auth.hook"
        text={RoomConfigText}
        listItemName={RoomConfigListItemFunc}
        connectionConfigComponent={ConnectionConfiguration}
    />;
};
