# 安装和运行

## 搭建 node 环境

* node.js 最低版本 v8.x 或者更高，推荐 v12.x LTS 或更高版本

## 下载文件 mybookmark 文件

解压放到某个目录中。

## Windows 下启动

* Windows 下点击 start.bat 即可运行，会大概一个运行窗口

* 如果想关闭程序，则关闭执行窗口即可

## Windows 下不弹窗启动

* Windows 下点击 startservice.bat 即可运行

* 如果想关闭服务，则在“任务管理器”窗口，查找 Node.js JavaScript Runtime 进程，杀掉即可。

## Linux 下启动

* sh start.sh

* 如果想关闭程序，按 CTRL+C 即可

## Linux 下后台启动

* sh startservice.sh

* 如果想关闭进程，则根据下面的脚本：

```
netstat | grep node
kill -9 查看到的进程id
```

## 修改端口

* 把 mybookmark/config.json.sample 复制 config.json

```
    cp config.json.sample config.json
```

* 修改 mybookmark/config.json 文件

```json
    {
        "port": 8080
    }
```

修改其中的 port，可改成需要的端口。

