// TODO: https://www.w3.org/TR/2017/NOTE-wai-aria-practices-1.1-20171214/examples/treeview/treeview-2/treeview-2a.html
// Fully accessibility support

import classNames from 'classnames';
import KeyCode from 'rc-util/lib/KeyCode';
import pickAttrs from 'rc-util/lib/pickAttrs';
import warning from 'rc-util/lib/warning';
import * as React from 'react';

import type {
  NodeDragEventHandler,
  NodeDragEventParams,
  NodeMouseEventHandler,
  NodeMouseEventParams,
} from './contextTypes';
import { TreeContext } from './contextTypes';
import DropIndicator from './DropIndicator';
import type { DropIndicatorProps } from './DropIndicator';
import type {
  BasicDataNode,
  DataNode,
  Direction,
  EventDataNode,
  FieldNames,
  FlattenNode,
  IconType,
  Key,
  KeyEntities,
  SafeKey,
  ScrollTo,
  TreeNodeProps,
} from './interface';
import NodeList, { MOTION_KEY, MotionEntity, type NodeListRef } from './NodeList';
import TreeNode from './TreeNode';
import {
  arrAdd,
  arrDel,
  calcDropPosition,
  calcSelectedKeys,
  conductExpandParent,
  getDragChildrenKeys,
  parseCheckedKeys,
  posToArr,
} from './util';
import { conductCheck } from './utils/conductUtil';
import getEntity from './utils/keyUtil';
import {
  convertDataToEntities,
  convertNodePropsToEventData,
  convertTreeToData,
  fillFieldNames,
  flattenTreeData,
  getTreeNodeProps,
  warningWithoutKey,
} from './utils/treeUtil';

const MAX_RETRY_TIMES = 10;

export interface CheckInfo<TreeDataType extends BasicDataNode = DataNode> {
  event: 'check';
  node: EventDataNode<TreeDataType>;
  checked: boolean;
  nativeEvent: MouseEvent;
  checkedNodes: TreeDataType[];
  checkedNodesPositions?: { node: TreeDataType; pos: string }[];
  halfCheckedKeys?: Key[];
}

export interface AllowDropOptions<TreeDataType extends BasicDataNode = DataNode> {
  dragNode: TreeDataType;
  dropNode: TreeDataType;
  dropPosition: -1 | 0 | 1;
}
export type AllowDrop<TreeDataType extends BasicDataNode = DataNode> = (
  options: AllowDropOptions<TreeDataType>,
) => boolean;

export type DraggableFn = (node: DataNode) => boolean;
export type DraggableConfig = {
  icon?: React.ReactNode | false;
  nodeDraggable?: DraggableFn;
};

export type ExpandAction = false | 'click' | 'doubleClick';

export interface TreeProps<TreeDataType extends BasicDataNode = DataNode> {
  prefixCls: string;
  className?: string;
  style?: React.CSSProperties;
  focusable?: boolean;
  activeKey?: Key | null;
  tabIndex?: number;
  children?: React.ReactNode;
  treeData?: TreeDataType[]; // Generate treeNode by children
  fieldNames?: FieldNames;
  showLine?: boolean;
  showIcon?: boolean;
  icon?: IconType;
  selectable?: boolean;
  expandAction?: ExpandAction;
  disabled?: boolean;
  multiple?: boolean;
  checkable?: boolean | React.ReactNode;
  checkStrictly?: boolean;
  draggable?: DraggableFn | boolean | DraggableConfig;
  defaultExpandParent?: boolean;
  autoExpandParent?: boolean;
  defaultExpandAll?: boolean;
  defaultExpandedKeys?: Key[];
  expandedKeys?: Key[];
  defaultCheckedKeys?: Key[];
  checkedKeys?: Key[] | { checked: Key[]; halfChecked: Key[] };
  defaultSelectedKeys?: Key[];
  selectedKeys?: Key[];
  allowDrop?: AllowDrop<TreeDataType>;
  titleRender?: (node: TreeDataType) => React.ReactNode;
  dropIndicatorRender?: (props: DropIndicatorProps) => React.ReactNode;
  onFocus?: React.FocusEventHandler<HTMLDivElement>;
  onBlur?: React.FocusEventHandler<HTMLDivElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
  onClick?: NodeMouseEventHandler<TreeDataType>;
  onDoubleClick?: NodeMouseEventHandler<TreeDataType>;
  onScroll?: React.UIEventHandler<HTMLElement>;
  onExpand?: (
    expandedKeys: Key[],
    info: {
      node: EventDataNode<TreeDataType>;
      expanded: boolean;
      nativeEvent: MouseEvent;
    },
  ) => void;
  onCheck?: (
    checked: { checked: Key[]; halfChecked: Key[] } | Key[],
    info: CheckInfo<TreeDataType>,
  ) => void;
  onSelect?: (
    selectedKeys: Key[],
    info: {
      event: 'select';
      selected: boolean;
      node: EventDataNode<TreeDataType>;
      selectedNodes: TreeDataType[];
      nativeEvent: MouseEvent;
    },
  ) => void;
  onLoad?: (
    loadedKeys: Key[],
    info: {
      event: 'load';
      node: EventDataNode<TreeDataType>;
    },
  ) => void;
  loadData?: (treeNode: EventDataNode<TreeDataType>) => Promise<any>;
  loadedKeys?: Key[];
  onMouseEnter?: (info: NodeMouseEventParams<TreeDataType>) => void;
  onMouseLeave?: (info: NodeMouseEventParams<TreeDataType>) => void;
  onRightClick?: (info: { event: React.MouseEvent; node: EventDataNode<TreeDataType> }) => void;
  onDragStart?: (info: NodeDragEventParams<TreeDataType>) => void;
  onDragEnter?: (info: NodeDragEventParams<TreeDataType> & { expandedKeys: Key[] }) => void;
  onDragOver?: (info: NodeDragEventParams<TreeDataType>) => void;
  onDragLeave?: (info: NodeDragEventParams<TreeDataType>) => void;
  onDragEnd?: (info: NodeDragEventParams<TreeDataType>) => void;
  onDrop?: (
    info: NodeDragEventParams<TreeDataType> & {
      dragNode: EventDataNode<TreeDataType>;
      dragNodesKeys: Key[];
      dropPosition: number;
      dropToGap: boolean;
    },
  ) => void;
  /**
   * Used for `rc-tree-select` only.
   * Do not use in your production code directly since this will be refactor.
   */
  onActiveChange?: (key: Key) => void;
  filterTreeNode?: (treeNode: EventDataNode<TreeDataType>) => boolean;
  motion?: any;
  switcherIcon?: IconType;

  // Virtual List
  height?: number;
  itemHeight?: number;
  scrollWidth?: number;
  itemScrollOffset?: number;
  virtual?: boolean;

  // direction for drag logic
  direction?: Direction;

  rootClassName?: string;
  rootStyle?: React.CSSProperties;
}

interface TreeState<TreeDataType extends BasicDataNode = DataNode> {
  keyEntities: KeyEntities<TreeDataType>;

  indent: number | null;

  selectedKeys: Key[];
  checkedKeys: Key[];
  halfCheckedKeys: Key[];
  loadedKeys: Key[];
  loadingKeys: Key[];
  expandedKeys: Key[];

  draggingNodeKey: Key;
  dragChildrenKeys: Key[];

  // for details see comment in Tree.state
  dropPosition: -1 | 0 | 1 | null;
  dropLevelOffset: number | null;
  dropContainerKey: Key | null;
  dropTargetKey: Key | null;
  dropTargetPos: string | null;
  dropAllowed: boolean;
  dragOverNodeKey: Key | null;

  treeData: TreeDataType[];
  flattenNodes: FlattenNode<TreeDataType>[];

  focused: boolean;
  activeKey: Key | null;

  // Record if list is changing
  listChanging: boolean;

  prevProps: TreeProps;

  fieldNames: FieldNames;
}

const Tree: React.FC<TreeProps> = <TreeDataType extends DataNode | BasicDataNode = DataNode>(
  props,
) => {
  const {
    prefixCls = 'rc-tree',
    className,
    style,
    showLine = false,
    focusable = true,
    tabIndex = 0,
    selectable = true,
    showIcon = true,
    icon,
    switcherIcon,
    draggable,
    checkable = false,
    checkStrictly = false,
    disabled = false,
    motion,
    loadData,
    filterTreeNode,
    height,
    itemHeight,
    scrollWidth,
    virtual,
    titleRender,
    dropIndicatorRender = DropIndicator,
    onContextMenu,
    onScroll,
    direction,
    rootClassName,
    rootStyle,
    // activeKey,
    // itemScrollOffset = 0,
    // onActiveChange,
    // onKeyDown,
    // onFocus,
    // onBlur,
    // onClick,
    // onDoubleClick,
    // onExpand,
    // onCheck,
    // onSelect,
    // onLoad,
    // onMouseEnter,
    // onMouseLeave,
    // onRightClick,
    // onDragStart,
    // onDragEnter,
    // onDragOver,
    // onDragLeave,
    // onDragEnd,
    // onDrop,
    allowDrop = () => true,
    expandAction = false,
    treeData: propTreeData,
    fieldNames: propFieldNames,
    expandedKeys: propExpandedKeys,
    defaultExpandParent = true,
    autoExpandParent = false,
    defaultExpandAll = false,
    defaultExpandedKeys = [],
    defaultCheckedKeys = [],
    defaultSelectedKeys = [],
    loadedKeys: propLoadedKeys,
    selectedKeys: propSelectedKeys,
    checkedKeys: propCheckedKeys,
  } = props;

  //TODO:    static TreeNode = TreeNode;

  const listRef = React.useRef<NodeListRef>(null);
  const dragStartMousePosition = React.useRef<{ x: number; y: number } | null>(null);
  const dragNodeProps = React.useRef<TreeNodeProps<TreeDataType> | null>(null);
  const currentMouseOverDroppableNodeKey = React.useRef<Key | null>(null);
  const delayedDragEnterLogic = React.useRef<Record<SafeKey, number>>({});
  const loadingRetryTimes = React.useRef<Record<SafeKey, number>>({});
  let destroyed: boolean = false;

  const [keyEntities, setKeyEntities] = React.useState({});
  const [indent, setIndent] = React.useState(null);
  const [selectedKeys, setSelectedKeys] = React.useState([]);
  const [checkedKeys, setCheckedKeys] = React.useState([]);
  const [halfCheckedKeys, setHalfCheckedKeys] = React.useState([]);
  const [loadedKeys, setLoadedKeys] = React.useState([]);
  const [loadingKeys, setLoadingKeys] = React.useState([]);
  const [expandedKeys] = React.useState([]);
  const [draggingNodeKey, setDraggingNodeKey] = React.useState(null);
  const [dragChildrenKeys, setDragChildrenKeys] = React.useState([]);

  // dropTargetKey is the key of abstract-drop-node
  // the abstract-drop-node is the real drop node when drag and drop
  // not the DOM drag over node
  const [dropTargetKey, setDropTargetKey] = React.useState(null);
  const [dropPosition, setDropPosition] = React.useState(null); // the drop position of abstract-drop-node, inside 0, top -1, bottom 1
  const [dropContainerKey, setDropContainerKey] = React.useState(null); // the container key of abstract-drop-node if dropPosition is -1 or 1
  const [dropLevelOffset, setDropLevelOffset] = React.useState(null); // the drop level offset of abstract-drag-over-node
  const [dropTargetPos, setDropTargetPos] = React.useState(null); // the pos of abstract-drop-node
  const [dropAllowed, setDropAllowed] = React.useState(true); // if drop to abstract-drop-node is allowed
  // the abstract-drag-over-node
  // if mouse is on the bottom of top dom node or no the top of the bottom dom node
  // abstract-drag-over-node is the top node
  const [dragOverNodeKey, setDragOverNodeKey] = React.useState(null);

  const [treeData, setTreeData] = React.useState([]);
  const [flattenNodes, setFlattenNodes] = React.useState([]);
  const [focused, setFocused] = React.useState(false);
  const [activeKey, setActiveKey] = React.useState(null);
  const [listChanging, setListChanging] = React.useState(false);
  const [prevProps, setPrevProps] = React.useState(null);
  const [fieldNames, setFieldNames] = React.useState(() => fillFieldNames());

  React.useEffect(() => {
    const { activeKey, itemScrollOffset = 0 } = props;

    if (props.activeKey !== undefined && props.activeKey !== activeKey) {
      setActiveKey(props.activeKey);

      if (activeKey !== null) {
        scrollTo({ key: activeKey, offset: itemScrollOffset });
      }
    }
  }, [activeKey, props.itemScrollOffset]);

  React.useEffect(() => {
    return () => {
      window.removeEventListener('dragend', onWindowDragEnd);
    };
  }, []);

  //TODO: static
  //   static getDerivedStateFromProps(props: TreeProps, prevState: TreeState) {
  //     const { prevProps } = prevState;
  //     const newState: Partial<TreeState> = {
  //       prevProps: props,
  //     };

  //     function needSync(name: string) {
  //       return (
  //         (!prevProps && props.hasOwnProperty(name)) || (prevProps && prevProps[name] !== props[name])
  //       );
  //     }

  //     // ================== Tree Node ==================
  //     let treeData: DataNode[];

  //     // fieldNames
  //     let { fieldNames } = prevState;
  //     if (needSync('fieldNames')) {
  //       fieldNames = fillFieldNames(props.fieldNames);
  //       newState.fieldNames = fieldNames;
  //     }

  //     // Check if `treeData` or `children` changed and save into the state.
  //     if (needSync('treeData')) {
  //       ({ treeData } = props);
  //     } else if (needSync('children')) {
  //       warning(false, '`children` of Tree is deprecated. Please use `treeData` instead.');
  //       treeData = convertTreeToData(props.children);
  //     }

  //     // Save flatten nodes info and convert `treeData` into keyEntities
  //     if (treeData) {
  //       newState.treeData = treeData;
  //       const entitiesMap = convertDataToEntities(treeData, { fieldNames });
  //       newState.keyEntities = {
  //         [MOTION_KEY]: MotionEntity,
  //         ...entitiesMap.keyEntities,
  //       };

  //       // Warning if treeNode not provide key
  //       if (process.env.NODE_ENV !== 'production') {
  //         warningWithoutKey(treeData, fieldNames);
  //       }
  //     }

  //     const keyEntities = newState.keyEntities || prevState.keyEntities;

  //     // ================ expandedKeys =================
  //     if (needSync('expandedKeys') || (prevProps && needSync('autoExpandParent'))) {
  //       newState.expandedKeys =
  //         props.autoExpandParent || (!prevProps && props.defaultExpandParent)
  //           ? conductExpandParent(props.expandedKeys, keyEntities)
  //           : props.expandedKeys;
  //     } else if (!prevProps && props.defaultExpandAll) {
  //       const cloneKeyEntities = { ...keyEntities };
  //       delete cloneKeyEntities[MOTION_KEY];

  //       // Only take the key who has the children to enhance the performance
  //       const nextExpandedKeys: React.Key[] = [];
  //       Object.keys(cloneKeyEntities).forEach(key => {
  //         const entity = cloneKeyEntities[key];
  //         if (entity.children && entity.children.length) {
  //           nextExpandedKeys.push(entity.key);
  //         }
  //       });

  //       newState.expandedKeys = nextExpandedKeys;
  //     } else if (!prevProps && props.defaultExpandedKeys) {
  //       newState.expandedKeys =
  //         props.autoExpandParent || props.defaultExpandParent
  //           ? conductExpandParent(props.defaultExpandedKeys, keyEntities)
  //           : props.defaultExpandedKeys;
  //     }

  //     if (!newState.expandedKeys) {
  //       delete newState.expandedKeys;
  //     }

  //     // ================ flattenNodes =================
  //     if (treeData || newState.expandedKeys) {
  //       const flattenNodes = flattenTreeData<DataNode>(
  //         treeData || prevState.treeData,
  //         newState.expandedKeys || prevState.expandedKeys,
  //         fieldNames,
  //       );
  //       newState.flattenNodes = flattenNodes;
  //     }

  //     // ================ selectedKeys =================
  //     if (props.selectable) {
  //       if (needSync('selectedKeys')) {
  //         newState.selectedKeys = calcSelectedKeys(props.selectedKeys, props);
  //       } else if (!prevProps && props.defaultSelectedKeys) {
  //         newState.selectedKeys = calcSelectedKeys(props.defaultSelectedKeys, props);
  //       }
  //     }

  //     // ================= checkedKeys =================
  //     if (props.checkable) {
  //       let checkedKeyEntity: { checkedKeys?: Key[]; halfCheckedKeys?: Key[] };

  //       if (needSync('checkedKeys')) {
  //         checkedKeyEntity = parseCheckedKeys(props.checkedKeys) || {};
  //       } else if (!prevProps && props.defaultCheckedKeys) {
  //         checkedKeyEntity = parseCheckedKeys(props.defaultCheckedKeys) || {};
  //       } else if (treeData) {
  //         // If `treeData` changed, we also need check it
  //         checkedKeyEntity = parseCheckedKeys(props.checkedKeys) || {
  //           checkedKeys: prevState.checkedKeys,
  //           halfCheckedKeys: prevState.halfCheckedKeys,
  //         };
  //       }

  //       if (checkedKeyEntity) {
  //         let { checkedKeys = [], halfCheckedKeys = [] } = checkedKeyEntity;

  //         if (!props.checkStrictly) {
  //           const conductKeys = conductCheck(checkedKeys, true, keyEntities);
  //           ({ checkedKeys, halfCheckedKeys } = conductKeys);
  //         }

  //         newState.checkedKeys = checkedKeys;
  //         newState.halfCheckedKeys = halfCheckedKeys;
  //       }
  //     }

  //     // ================= loadedKeys ==================
  //     if (needSync('loadedKeys')) {
  //       newState.loadedKeys = props.loadedKeys;
  //     }

  //     return newState;
  //   }

  const onNodeDragStart: NodeDragEventHandler<TreeDataType, HTMLDivElement> = (
    event,
    nodeProps,
  ) => {
    const { expandedKeys, keyEntities } = state;
    const { onDragStart } = props;
    const { eventKey } = nodeProps;

    dragNodeProps = nodeProps;
    dragStartMousePosition = {
      x: event.clientX,
      y: event.clientY,
    };

    const newExpandedKeys = arrDel(expandedKeys, eventKey);

    setState({
      draggingNodeKey: eventKey,
      dragChildrenKeys: getDragChildrenKeys(eventKey, keyEntities),
      indent: listRef.current.getIndentWidth(),
    });

    setExpandedKeys(newExpandedKeys);

    window.addEventListener('dragend', onWindowDragEnd);

    onDragStart?.({ event, node: convertNodePropsToEventData<TreeDataType>(nodeProps) });
  };

  /**
   * [Legacy] Select handler is smaller than node,
   * so that this will trigger when drag enter node or select handler.
   * This is a little tricky if customize css without padding.
   * Better for use mouse move event to refresh drag state.
   * But let's just keep it to avoid event trigger logic change.
   */
  const onNodeDragEnter = (
    event: React.DragEvent<HTMLDivElement>,
    nodeProps: TreeNodeProps<TreeDataType>,
  ) => {
    // const { expandedKeys, keyEntities, dragChildrenKeys, flattenNodes, indent } = state;
    const { onDragEnter, onExpand, allowDrop, direction } = props;
    const { pos, eventKey } = nodeProps;

    // record the key of node which is latest entered, used in dragleave event.
    if (currentMouseOverDroppableNodeKey !== eventKey) {
      currentMouseOverDroppableNodeKey = eventKey;
    }

    if (!dragNodeProps) {
      resetDragState();
      return;
    }

    const {
      dropPosition,
      dropLevelOffset,
      dropTargetKey,
      dropContainerKey,
      dropTargetPos,
      dropAllowed,
      dragOverNodeKey,
    } = calcDropPosition<TreeDataType>(
      event,
      dragNodeProps,
      nodeProps,
      indent,
      dragStartMousePosition,
      allowDrop,
      flattenNodes,
      keyEntities,
      expandedKeys,
      direction,
    );

    if (
      // don't allow drop inside its children
      dragChildrenKeys.includes(dropTargetKey) ||
      // don't allow drop when drop is not allowed caculated by calcDropPosition
      !dropAllowed
    ) {
      resetDragState();
      return;
    }

    // Side effect for delay drag
    if (!delayedDragEnterLogic) {
      delayedDragEnterLogic = {};
    }
    Object.keys(delayedDragEnterLogic).forEach(key => {
      clearTimeout(delayedDragEnterLogic[key]);
    });

    if (dragNodeProps.eventKey !== nodeProps.eventKey) {
      // hoist expand logic here
      // since if logic is on the bottom
      // it will be blocked by abstract dragover node check
      //   => if you dragenter from top, you mouse will still be consider as in the top node
      event.persist();
      delayedDragEnterLogic[pos] = window.setTimeout(() => {
        if (state.draggingNodeKey === null) {
          return;
        }

        let newExpandedKeys = [...expandedKeys];
        const entity = getEntity(keyEntities, nodeProps.eventKey);

        if (entity && (entity.children || []).length) {
          newExpandedKeys = arrAdd(expandedKeys, nodeProps.eventKey);
        }

        if (!props.hasOwnProperty('expandedKeys')) {
          setExpandedKeys(newExpandedKeys);
        }

        onExpand?.(newExpandedKeys, {
          node: convertNodePropsToEventData<TreeDataType>(nodeProps),
          expanded: true,
          nativeEvent: event.nativeEvent,
        });
      }, 800);
    }

    // Skip if drag node is self
    if (dragNodeProps.eventKey === dropTargetKey && dropLevelOffset === 0) {
      resetDragState();
      return;
    }

    // Update drag over node and drag state
    setState({
      dragOverNodeKey,
      dropPosition,
      dropLevelOffset,
      dropTargetKey,
      dropContainerKey,
      dropTargetPos,
      dropAllowed,
    });

    onDragEnter?.({
      event,
      node: convertNodePropsToEventData<TreeDataType>(nodeProps),
      expandedKeys,
    });
  };

  const onNodeDragOver = (
    event: React.DragEvent<HTMLDivElement>,
    nodeProps: TreeNodeProps<TreeDataType>,
  ) => {
    const { dragChildrenKeys, flattenNodes, keyEntities, expandedKeys, indent } = state;
    const { onDragOver, allowDrop, direction } = props;

    if (!dragNodeProps) {
      return;
    }

    const {
      dropPosition,
      dropLevelOffset,
      dropTargetKey,
      dropContainerKey,
      dropTargetPos,
      dropAllowed,
      dragOverNodeKey,
    } = calcDropPosition<TreeDataType>(
      event,
      dragNodeProps,
      nodeProps,
      indent,
      dragStartMousePosition,
      allowDrop,
      flattenNodes,
      keyEntities,
      expandedKeys,
      direction,
    );

    if (dragChildrenKeys.includes(dropTargetKey) || !dropAllowed) {
      // don't allow drop inside its children
      // don't allow drop when drop is not allowed calculated by calcDropPosition
      return;
    }

    // Update drag position

    if (dragNodeProps.eventKey === dropTargetKey && dropLevelOffset === 0) {
      if (
        !(
          dropPosition === null &&
          dropLevelOffset === null &&
          dropTargetKey === null &&
          dropContainerKey === null &&
          dropTargetPos === null &&
          dropAllowed === false &&
          dragOverNodeKey === null
        )
      ) {
        resetDragState();
      }
    } else if (
      !(
        dropPosition === dropPosition &&
        dropLevelOffset === dropLevelOffset &&
        dropTargetKey === dropTargetKey &&
        dropContainerKey === dropContainerKey &&
        dropTargetPos === dropTargetPos &&
        dropAllowed === dropAllowed &&
        dragOverNodeKey === dragOverNodeKey
      )
    ) {
      setState({
        dropPosition,
        dropLevelOffset,
        dropTargetKey,
        dropContainerKey,
        dropTargetPos,
        dropAllowed,
        dragOverNodeKey,
      });
    }

    onDragOver?.({ event, node: convertNodePropsToEventData<TreeDataType>(nodeProps) });
  };

  const onNodeDragLeave: NodeDragEventHandler<TreeDataType> = (event, nodeProps) => {
    // if it is outside the droppable area
    // currentMouseOverDroppableNodeKey will be updated in dragenter event when into another droppable receiver.
    if (
      currentMouseOverDroppableNodeKey === nodeProps.eventKey &&
      !event.currentTarget.contains(event.relatedTarget as Node)
    ) {
      resetDragState();
      currentMouseOverDroppableNodeKey = null;
    }

    const { onDragLeave } = props;

    onDragLeave?.({ event, node: convertNodePropsToEventData<TreeDataType>(nodeProps) });
  };

  // since stopPropagation() is called in treeNode
  // if onWindowDrag is called, whice means state is keeped, drag state should be cleared
  const onWindowDragEnd = event => {
    onNodeDragEnd(event, null, true);
    window.removeEventListener('dragend', onWindowDragEnd);
  };

  // if onNodeDragEnd is called, onWindowDragEnd won't be called since stopPropagation() is called
  const onNodeDragEnd: NodeDragEventHandler<TreeDataType> = (event, nodeProps) => {
    const { onDragEnd } = props;
    setState({
      dragOverNodeKey: null,
    });

    cleanDragState();

    onDragEnd?.({ event, node: convertNodePropsToEventData<TreeDataType>(nodeProps) });

    dragNodeProps = null;

    window.removeEventListener('dragend', onWindowDragEnd);
  };

  const onNodeDrop = (
    event: React.DragEvent<HTMLDivElement>,
    _: TreeNodeProps<TreeDataType>,
    outsideTree: boolean = false,
  ) => {
    const { dragChildrenKeys, dropPosition, dropTargetKey, dropTargetPos, dropAllowed } = state;

    if (!dropAllowed) {
      return;
    }

    const { onDrop } = props;

    setState({
      dragOverNodeKey: null,
    });
    cleanDragState();

    if (dropTargetKey === null) return;

    const abstractDropNodeProps = {
      ...getTreeNodeProps(dropTargetKey, getTreeNodeRequiredProps()),
      active: getActiveItem()?.key === dropTargetKey,
      data: getEntity(keyEntities, dropTargetKey).node,
    };

    const dropToChild = dragChildrenKeys.includes(dropTargetKey);

    warning(
      !dropToChild,
      "Can not drop to dragNode's children node. This is a bug of rc-tree. Please report an issue.",
    );

    const posArr = posToArr(dropTargetPos);

    const dropResult = {
      event,
      node: convertNodePropsToEventData<TreeDataType>(abstractDropNodeProps),
      dragNode: dragNodeProps ? convertNodePropsToEventData(dragNodeProps) : null,
      dragNodesKeys: [dragNodeProps.eventKey].concat(dragChildrenKeys),
      dropToGap: dropPosition !== 0,
      dropPosition: dropPosition + Number(posArr[posArr.length - 1]),
    };

    if (!outsideTree) {
      onDrop?.(dropResult);
    }

    dragNodeProps = null;
  };

  const resetDragState = () => {
    setState({
      dragOverNodeKey: null,
      dropPosition: null,
      dropLevelOffset: null,
      dropTargetKey: null,
      dropContainerKey: null,
      dropTargetPos: null,
      dropAllowed: false,
    });
  };

  const cleanDragState = () => {
    const { draggingNodeKey } = state;
    if (draggingNodeKey !== null) {
      setState({
        draggingNodeKey: null,
        dropPosition: null,
        dropContainerKey: null,
        dropTargetKey: null,
        dropLevelOffset: null,
        dropAllowed: true,
        dragOverNodeKey: null,
      });
    }
    dragStartMousePosition = null;
    currentMouseOverDroppableNodeKey = null;
  };

  const triggerExpandActionExpand: NodeMouseEventHandler = (e, treeNode) => {
    const { expandedKeys, flattenNodes } = state;
    const { expanded, key, isLeaf } = treeNode;

    if (isLeaf || e.shiftKey || e.metaKey || e.ctrlKey) {
      return;
    }

    const node = flattenNodes.filter(nodeItem => nodeItem.key === key)[0];
    const eventNode = convertNodePropsToEventData<TreeDataType>({
      ...getTreeNodeProps(key, getTreeNodeRequiredProps()),
      data: node.data,
    });

    setExpandedKeys(expanded ? arrDel(expandedKeys, key) : arrAdd(expandedKeys, key));
    onNodeExpand(e as React.MouseEvent<HTMLDivElement>, eventNode);
  };

  const onNodeClick: NodeMouseEventHandler<TreeDataType> = (e, treeNode) => {
    const { onClick, expandAction } = props;

    if (expandAction === 'click') {
      triggerExpandActionExpand(e, treeNode);
    }

    onClick?.(e, treeNode);
  };

  const onNodeDoubleClick: NodeMouseEventHandler<TreeDataType> = (e, treeNode) => {
    const { onDoubleClick, expandAction } = props;

    if (expandAction === 'doubleClick') {
      triggerExpandActionExpand(e, treeNode);
    }

    onDoubleClick?.(e, treeNode);
  };

  const onNodeSelect: NodeMouseEventHandler<TreeDataType> = (e, treeNode) => {
    let { selectedKeys } = state;
    const { keyEntities, fieldNames } = state;
    const { onSelect, multiple } = props;
    const { selected } = treeNode;
    const key = treeNode[fieldNames.key];
    const targetSelected = !selected;

    // Update selected keys
    if (!targetSelected) {
      selectedKeys = arrDel(selectedKeys, key);
    } else if (!multiple) {
      selectedKeys = [key];
    } else {
      selectedKeys = arrAdd(selectedKeys, key);
    }

    // [Legacy] Not found related usage in doc or upper libs
    const selectedNodes = selectedKeys
      .map(selectedKey => {
        const entity = getEntity(keyEntities, selectedKey);
        return entity ? entity.node : null;
      })
      .filter(Boolean);

    setUncontrolledState({ selectedKeys });

    onSelect?.(selectedKeys, {
      event: 'select',
      selected: targetSelected,
      node: treeNode,
      selectedNodes,
      nativeEvent: e.nativeEvent,
    });
  };

  const onNodeCheck = (
    e: React.MouseEvent<HTMLSpanElement>,
    treeNode: EventDataNode<TreeDataType>,
    checked: boolean,
  ) => {
    const { keyEntities, checkedKeys: oriCheckedKeys, halfCheckedKeys: oriHalfCheckedKeys } = state;
    const { checkStrictly, onCheck } = props;
    const { key } = treeNode;

    // Prepare trigger arguments
    let checkedObj: { checked: Key[]; halfChecked: Key[] } | React.Key[];

    const eventObj: Partial<CheckInfo<TreeDataType>> = {
      event: 'check',
      node: treeNode,
      checked,
      nativeEvent: e.nativeEvent,
    };

    if (checkStrictly) {
      const checkedKeys = checked ? arrAdd(oriCheckedKeys, key) : arrDel(oriCheckedKeys, key);
      const halfCheckedKeys = arrDel(oriHalfCheckedKeys, key);
      checkedObj = { checked: checkedKeys, halfChecked: halfCheckedKeys };

      eventObj.checkedNodes = checkedKeys
        .map(checkedKey => getEntity(keyEntities, checkedKey))
        .filter(Boolean)
        .map(entity => entity.node);

      setUncontrolledState({ checkedKeys });
    } else {
      // Always fill first
      let { checkedKeys, halfCheckedKeys } = conductCheck(
        [...oriCheckedKeys, key],
        true,
        keyEntities,
      );

      // If remove, we do it again to correction
      if (!checked) {
        const keySet = new Set(checkedKeys);
        keySet.delete(key);
        ({ checkedKeys, halfCheckedKeys } = conductCheck(
          Array.from(keySet),
          { checked: false, halfCheckedKeys },
          keyEntities,
        ));
      }

      checkedObj = checkedKeys;

      // [Legacy] This is used for `rc-tree-select`
      eventObj.checkedNodes = [];
      eventObj.checkedNodesPositions = [];
      eventObj.halfCheckedKeys = halfCheckedKeys;

      checkedKeys.forEach(checkedKey => {
        const entity = getEntity(keyEntities, checkedKey);
        if (!entity) return;

        const { node, pos } = entity;

        eventObj.checkedNodes.push(node);
        eventObj.checkedNodesPositions.push({ node, pos });
      });

      setUncontrolledState({ checkedKeys }, false, { halfCheckedKeys });
    }

    onCheck?.(checkedObj, eventObj as CheckInfo<TreeDataType>);
  };

  const onNodeLoad = (treeNode: EventDataNode<TreeDataType>) => {
    const { key } = treeNode;
    const { keyEntities } = state;

    // Skip if has children already
    const entity = getEntity(keyEntities, key);
    if (entity?.children?.length) {
      return;
    }

    const loadPromise = new Promise<void>((resolve, reject) => {
      // We need to get the latest state of loading/loaded keys
      setState(({ loadedKeys = [], loadingKeys = [] }) => {
        const { loadData, onLoad } = props;

        if (!loadData || loadedKeys.includes(key) || loadingKeys.includes(key)) {
          return null;
        }

        // Process load data
        const promise = loadData(treeNode);
        promise
          .then(() => {
            const { loadedKeys: currentLoadedKeys } = state;
            const newLoadedKeys = arrAdd(currentLoadedKeys, key);

            // onLoad should trigger before internal setState to avoid `loadData` trigger twice.
            // https://github.com/ant-design/ant-design/issues/12464
            onLoad?.(newLoadedKeys, {
              event: 'load',
              node: treeNode,
            });

            setUncontrolledState({
              loadedKeys: newLoadedKeys,
            });
            setState(prevState => ({
              loadingKeys: arrDel(prevState.loadingKeys, key),
            }));

            resolve();
          })
          .catch(e => {
            setState(prevState => ({
              loadingKeys: arrDel(prevState.loadingKeys, key),
            }));

            // If exceed max retry times, we give up retry
            loadingRetryTimes[key as SafeKey] = (loadingRetryTimes[key as SafeKey] || 0) + 1;
            if (loadingRetryTimes[key as SafeKey] >= MAX_RETRY_TIMES) {
              const { loadedKeys: currentLoadedKeys } = state;

              warning(false, 'Retry for `loadData` many times but still failed. No more retry.');

              setUncontrolledState({
                loadedKeys: arrAdd(currentLoadedKeys, key),
              });
              resolve();
            }

            reject(e);
          });

        return {
          loadingKeys: arrAdd(loadingKeys, key),
        };
      });
    });

    // Not care warning if we ignore this
    loadPromise.catch(() => {});

    return loadPromise;
  };

  const onNodeMouseEnter: NodeMouseEventHandler<TreeDataType> = (event, node) => {
    const { onMouseEnter } = props;

    onMouseEnter?.({ event, node });
  };

  const onNodeMouseLeave: NodeMouseEventHandler<TreeDataType> = (event, node) => {
    const { onMouseLeave } = props;

    onMouseLeave?.({ event, node });
  };

  const onNodeContextMenu: NodeMouseEventHandler<TreeDataType> = (event, node) => {
    const { onRightClick } = props;
    if (onRightClick) {
      event.preventDefault();
      onRightClick({ event, node });
    }
  };

  const onFocus: React.FocusEventHandler<HTMLDivElement> = (...args) => {
    const { onFocus } = props;
    setState({ focused: true });

    onFocus?.(...args);
  };

  const onBlur: React.FocusEventHandler<HTMLDivElement> = (...args) => {
    const { onBlur } = props;
    setState({ focused: false });
    onActiveChange(null);

    onBlur?.(...args);
  };

  const getTreeNodeRequiredProps = () => {
    const {
      expandedKeys,
      selectedKeys,
      loadedKeys,
      loadingKeys,
      checkedKeys,
      halfCheckedKeys,
      dragOverNodeKey,
      dropPosition,
      keyEntities,
    } = state;
    return {
      expandedKeys: expandedKeys || [],
      selectedKeys: selectedKeys || [],
      loadedKeys: loadedKeys || [],
      loadingKeys: loadingKeys || [],
      checkedKeys: checkedKeys || [],
      halfCheckedKeys: halfCheckedKeys || [],
      dragOverNodeKey,
      dropPosition,
      keyEntities: keyEntities,
    };
  };

  // =========================== Expanded ===========================
  /** Set uncontrolled `expandedKeys`. This will also auto update `flattenNodes`. */
  const setExpandedKeys = (expandedKeys: Key[]) => {
    const { treeData, fieldNames } = state;
    const flattenNodes = flattenTreeData<TreeDataType>(treeData, expandedKeys, fieldNames);
    setUncontrolledState({ expandedKeys, flattenNodes }, true);
  };

  const onNodeExpand = (
    e: React.MouseEvent<HTMLDivElement>,
    treeNode: EventDataNode<TreeDataType>,
  ) => {
    let { expandedKeys } = state;
    const { listChanging, fieldNames } = state;
    const { onExpand, loadData } = props;
    const { expanded } = treeNode;
    const key = treeNode[fieldNames.key];

    // Do nothing when motion is in progress
    if (listChanging) {
      return;
    }

    // Update selected keys
    const certain = expandedKeys.includes(key);
    const targetExpanded = !expanded;

    warning(
      (expanded && certain) || (!expanded && !certain),
      'Expand state not sync with index check',
    );

    expandedKeys = targetExpanded ? arrAdd(expandedKeys, key) : arrDel(expandedKeys, key);

    setExpandedKeys(expandedKeys);

    onExpand?.(expandedKeys, {
      node: treeNode,
      expanded: targetExpanded,
      nativeEvent: e.nativeEvent,
    });

    // Async Load data
    if (targetExpanded && loadData) {
      const loadPromise = onNodeLoad(treeNode);
      if (loadPromise) {
        loadPromise
          .then(() => {
            // [Legacy] Refresh logic
            const newFlattenTreeData = flattenTreeData<TreeDataType>(
              treeData,
              expandedKeys,
              fieldNames,
            );
            setUncontrolledState({ flattenNodes: newFlattenTreeData });
          })
          .catch(() => {
            const { expandedKeys: currentExpandedKeys } = state;
            const expandedKeysToRestore = arrDel(currentExpandedKeys, key);
            setExpandedKeys(expandedKeysToRestore);
          });
      }
    }
  };

  const onListChangeStart = () => {
    setUncontrolledState({
      listChanging: true,
    });
  };

  const onListChangeEnd = () => {
    setTimeout(() => {
      setUncontrolledState({
        listChanging: false,
      });
    });
  };

  // =========================== Keyboard ===========================
  const onActiveChange = (newActiveKey: Key | null) => {
    const { onActiveChange, itemScrollOffset = 0 } = props;

    if (activeKey === newActiveKey) {
      return;
    }

    setActiveKey(newActiveKey);
    if (newActiveKey !== null) {
      scrollTo({ key: newActiveKey, offset: itemScrollOffset });
    }

    onActiveChange?.(newActiveKey);
  };

  const getActiveItem = () => {
    if (activeKey === null) {
      return null;
    }

    return flattenNodes.find(({ key }) => key === activeKey) || null;
  };

  const offsetActiveKey = (offset: number) => {
    let index = flattenNodes.findIndex(({ key }) => key === activeKey);

    // Align with index
    if (index === -1 && offset < 0) {
      index = flattenNodes.length;
    }

    index = (index + offset + flattenNodes.length) % flattenNodes.length;

    const item = flattenNodes[index];
    if (item) {
      const { key } = item;
      onActiveChange(key);
    } else {
      onActiveChange(null);
    }
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = event => {
    const { onKeyDown, checkable, selectable } = props;

    // >>>>>>>>>> Direction
    switch (event.which) {
      case KeyCode.UP: {
        offsetActiveKey(-1);
        event.preventDefault();
        break;
      }
      case KeyCode.DOWN: {
        offsetActiveKey(1);
        event.preventDefault();
        break;
      }
    }

    // >>>>>>>>>> Expand & Selection
    const activeItem = getActiveItem();
    if (activeItem && activeItem.data) {
      const treeNodeRequiredProps = getTreeNodeRequiredProps();

      const expandable =
        activeItem.data.isLeaf === false || !!(activeItem.data[fieldNames.children] || []).length;
      const eventNode = convertNodePropsToEventData<TreeDataType>({
        ...getTreeNodeProps(activeKey, treeNodeRequiredProps),
        data: activeItem.data,
        active: true,
      });

      switch (event.which) {
        // >>> Expand
        case KeyCode.LEFT: {
          // Collapse if possible
          if (expandable && expandedKeys.includes(activeKey)) {
            onNodeExpand({} as React.MouseEvent<HTMLDivElement>, eventNode);
          } else if (activeItem.parent) {
            onActiveChange(activeItem.parent.key);
          }
          event.preventDefault();
          break;
        }
        case KeyCode.RIGHT: {
          // Expand if possible
          if (expandable && !expandedKeys.includes(activeKey)) {
            onNodeExpand({} as React.MouseEvent<HTMLDivElement>, eventNode);
          } else if (activeItem.children && activeItem.children.length) {
            onActiveChange(activeItem.children[0].key);
          }
          event.preventDefault();
          break;
        }

        // Selection
        case KeyCode.ENTER:
        case KeyCode.SPACE: {
          if (
            checkable &&
            !eventNode.disabled &&
            eventNode.checkable !== false &&
            !eventNode.disableCheckbox
          ) {
            onNodeCheck(
              {} as React.MouseEvent<HTMLDivElement>,
              eventNode,
              !checkedKeys.includes(activeKey),
            );
          } else if (
            !checkable &&
            selectable &&
            !eventNode.disabled &&
            eventNode.selectable !== false
          ) {
            onNodeSelect({} as React.MouseEvent<HTMLDivElement>, eventNode);
          }
          break;
        }
      }
    }

    onKeyDown?.(event);
  };

  /**
   * Only update the value which is not in props
   */
  const setUncontrolledState = (
    state: Partial<TreeState<TreeDataType>>,
    atomic: boolean = false,
    forceState: Partial<TreeState<TreeDataType>> | null = null,
  ) => {
    if (!destroyed) {
      let needSync = false;
      let allPassed = true;
      const newState = {};

      Object.keys(state).forEach(name => {
        if (props.hasOwnProperty(name)) {
          allPassed = false;
          return;
        }

        needSync = true;
        newState[name] = state[name];
      });

      if (needSync && (!atomic || allPassed)) {
        setState({
          ...newState,
          ...forceState,
        } as TreeState<TreeDataType>);
      }
    }
  };

  const scrollTo: ScrollTo = scroll => {
    listRef.current.scrollTo(scroll);
  };

  const domProps: React.HTMLAttributes<HTMLDivElement> = pickAttrs(props, {
    aria: true,
    data: true,
  });

  // It's better move to hooks but we just simply keep here
  let draggableConfig: DraggableConfig;
  if (draggable) {
    if (typeof draggable === 'object') {
      draggableConfig = draggable;
    } else if (typeof draggable === 'function') {
      draggableConfig = {
        nodeDraggable: draggable,
      };
    } else {
      draggableConfig = {};
    }
  }

  const contextValue = {
    prefixCls,
    selectable,
    showIcon,
    icon,
    switcherIcon,
    draggable: draggableConfig,
    draggingNodeKey,
    checkable,
    checkStrictly,
    disabled,
    keyEntities,
    dropLevelOffset,
    dropContainerKey,
    dropTargetKey,
    dropPosition,
    dragOverNodeKey,
    indent,
    direction,
    dropIndicatorRender,
    loadData,
    filterTreeNode,
    titleRender,
    onNodeClick,
    onNodeDoubleClick,
    onNodeExpand,
    onNodeSelect,
    onNodeCheck,
    onNodeLoad,
    onNodeMouseEnter,
    onNodeMouseLeave,
    onNodeContextMenu,
    onNodeDragStart,
    onNodeDragEnter,
    onNodeDragOver,
    onNodeDragLeave,
    onNodeDragEnd,
    onNodeDrop,
  };

  return (
    <TreeContext.Provider value={contextValue}>
      <div
        className={classNames(prefixCls, className, rootClassName, {
          [`${prefixCls}-show-line`]: showLine,
          [`${prefixCls}-focused`]: focused,
          [`${prefixCls}-active-focused`]: activeKey !== null,
        })}
        style={rootStyle}
      >
        <NodeList
          ref={listRef}
          prefixCls={prefixCls}
          style={style}
          data={flattenNodes}
          disabled={disabled}
          selectable={selectable}
          checkable={!!checkable}
          motion={motion}
          dragging={draggingNodeKey !== null}
          height={height}
          itemHeight={itemHeight}
          virtual={virtual}
          focusable={focusable}
          focused={focused}
          tabIndex={tabIndex}
          activeItem={getActiveItem()}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          onActiveChange={onActiveChange}
          onListChangeStart={onListChangeStart}
          onListChangeEnd={onListChangeEnd}
          onContextMenu={onContextMenu}
          onScroll={onScroll}
          scrollWidth={scrollWidth}
          {...getTreeNodeRequiredProps()}
          {...domProps}
        />
      </div>
    </TreeContext.Provider>
  );
};

export default Tree;
