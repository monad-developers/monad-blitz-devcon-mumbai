SCENE = """
<mujoco model="trace-grasp">
  <compiler angle="radian"/>
  <option timestep="0.002" gravity="0 0 -9.81" cone="elliptic" impratio="10"/>
  <visual>
    <global offwidth="1280" offheight="720"/>
    <quality shadowsize="2048"/>
    <headlight ambient="0.45 0.45 0.45" diffuse="0.5 0.5 0.5"/>
  </visual>
  <asset>
    <texture type="skybox" builtin="gradient" rgb1="0.95 0.96 0.94" rgb2="0.78 0.81 0.78" width="512" height="512"/>
    <texture name="grid" type="2d" builtin="checker" width="512" height="512" rgb1="0.86 0.88 0.85" rgb2="0.80 0.83 0.79"/>
    <material name="table" texture="grid" texrepeat="8 8" reflectance="0"/>
    <material name="arm" rgba="0.08 0.11 0.10 1"/>
    <material name="joint" rgba="0.78 0.96 0.2 1"/>
    <material name="cup" rgba="0.91 0.85 0.65 1"/>
  </asset>
  <worldbody>
    <light pos="0.3 -0.6 1.2" dir="0 0.5 -1" diffuse="0.6 0.6 0.6"/>
    <geom name="table" type="plane" size="1 1 0.05" material="table" friction="0.8 0.005 0.0001"/>
    <camera name="side" pos="0.22 -1.05 0.34" xyaxes="1 0 0 0 0.2 1" fovy="48"/>
    <geom name="pedestal" type="cylinder" pos="0 0 0.06" size="0.05 0.06" material="arm"/>
    <body name="link1" pos="0 0 0.12">
      <joint name="j1" type="hinge" axis="0 1 0" damping="4" range="-2.6 2.6"/>
      <geom type="sphere" size="0.03" material="joint" contype="0" conaffinity="0"/>
      <geom type="capsule" fromto="0 0 0 0 0 0.30" size="0.022" material="arm" mass="0.6" contype="0" conaffinity="0"/>
      <body name="link2" pos="0 0 0.30">
        <joint name="j2" type="hinge" axis="0 1 0" damping="3" range="-2.8 2.8"/>
        <geom type="sphere" size="0.026" material="joint" contype="0" conaffinity="0"/>
        <geom type="capsule" fromto="0 0 0 0 0 0.28" size="0.018" material="arm" mass="0.45" contype="0" conaffinity="0"/>
        <body name="hand" pos="0 0 0.28">
          <joint name="j3" type="hinge" axis="0 1 0" damping="2" range="-3.0 3.0"/>
          <geom type="sphere" size="0.02" material="joint" contype="0" conaffinity="0"/>
          <geom name="palm" type="box" pos="0 0 0.02" size="0.075 0.02 0.01" material="arm" mass="0.15"/>
          <body name="finger_l" pos="-0.068 0 0.075">
            <joint name="fl" type="slide" axis="1 0 0" range="0 0.05" damping="2"/>
            <geom name="finger_l" type="box" size="0.008 0.018 0.045" material="arm" mass="0.05" friction="0.1 0.005 0.0001"/>
          </body>
          <body name="finger_r" pos="0.068 0 0.075">
            <joint name="fr" type="slide" axis="-1 0 0" range="0 0.05" damping="2"/>
            <geom name="finger_r" type="box" size="0.008 0.018 0.045" material="arm" mass="0.05" friction="0.1 0.005 0.0001"/>
          </body>
          <site name="grip" pos="0 0 0.09" size="0.005"/>
        </body>
      </body>
    </body>
    <body name="cup" pos="0.40 0 0.05">
      <freejoint name="cup"/>
      <geom name="cup" type="cylinder" size="0.03 0.05" material="cup" mass="0.25" friction="0.6 0.005 0.0001"/>
      <geom name="handle" type="capsule" fromto="0.042 0 0.025 0.042 0 -0.025" size="0.008" material="cup" mass="0.01" contype="0" conaffinity="0"/>
    </body>
  </worldbody>
  <actuator>
    <position name="a1" joint="j1" kp="600" forcerange="-60 60"/>
    <position name="a2" joint="j2" kp="400" forcerange="-40 40"/>
    <position name="a3" joint="j3" kp="150" forcerange="-15 15"/>
    <motor name="gl" joint="fl" ctrlrange="-30 30"/>
    <motor name="gr" joint="fr" ctrlrange="-30 30"/>
  </actuator>
</mujoco>
"""
